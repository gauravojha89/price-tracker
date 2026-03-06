const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const { EmailClient } = require('@azure/communication-email');

let cosmosClient = null;
let emailClient = null;

function getCosmosClient() {
  if (!cosmosClient) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error('COSMOS_ENDPOINT and COSMOS_KEY must be configured');
    }
    cosmosClient = new CosmosClient({ endpoint, key });
  }
  return cosmosClient;
}

function getEmailClient() {
  if (!emailClient) {
    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    if (connectionString) {
      emailClient = new EmailClient(connectionString);
    }
  }
  return emailClient;
}

// Timer trigger: runs daily at 6 AM UTC
app.timer('dailyPriceCheck', {
  schedule: '0 0 6 * * *', // 6 AM UTC every day
  handler: async (myTimer, context) => {
    context.log('Daily price check started at:', new Date().toISOString());

    const client = getCosmosClient();
    const database = client.database('pricetracker');
    const productsContainer = database.container('products');
    const usersContainer = database.container('users');

    const results = {
      totalProducts: 0,
      checked: 0,
      updated: 0,
      priceDrops: 0,
      notificationsSent: 0,
      errors: 0
    };

    try {
      // Get ALL products (across all users)
      const { resources: products } = await productsContainer.items
        .query('SELECT * FROM c WHERE c.url != null')
        .fetchAll();

      results.totalProducts = products.length;
      context.log(`Found ${products.length} products to check`);

      for (const product of products) {
        try {
          const checkResult = await checkProductPrice(context, product, productsContainer, usersContainer);
          results.checked++;
          
          if (checkResult.updated) results.updated++;
          if (checkResult.priceDrop) results.priceDrops++;
          if (checkResult.notificationSent) results.notificationsSent++;

          // Rate limiting - wait 1 second between checks
          await sleep(1000);

        } catch (error) {
          context.log.error(`Error checking product ${product.id}:`, error.message);
          results.errors++;
        }
      }

      context.log('Daily price check completed:', JSON.stringify(results));

    } catch (error) {
      context.log.error('Fatal error in daily price check:', error);
      throw error;
    }
  }
});

async function checkProductPrice(context, product, productsContainer, usersContainer) {
  const result = { updated: false, priceDrop: false, notificationSent: false };

  if (!product.url) {
    context.log(`Skipping ${product.name}: no URL`);
    return result;
  }

  try {
    // Scrape the current price
    const priceData = await scrapePrice(product.url, context);
    
    if (!priceData || priceData.price === null) {
      context.log(`Could not get price for ${product.name}`);
      return result;
    }

    const newPrice = priceData.price;
    const previousPrice = product.currentPrice;

    // Update the product
    const updatedProduct = {
      ...product,
      currentPrice: newPrice,
      previousPrice: previousPrice || newPrice,
      originalPrice: product.originalPrice || newPrice,
      lastChecked: new Date().toISOString(),
      priceHistory: [
        ...(product.priceHistory || []),
        { price: newPrice, date: new Date().toISOString() }
      ].slice(-30) // Keep last 30 entries
    };

    await productsContainer.items.upsert(updatedProduct);
    result.updated = true;

    // Check for price drop below target
    if (product.targetPrice && newPrice <= product.targetPrice && (!previousPrice || newPrice < previousPrice)) {
      result.priceDrop = true;
      context.log(`Price drop detected for ${product.name}: $${previousPrice} -> $${newPrice} (target: $${product.targetPrice})`);

      // Send notification
      const notificationSent = await sendPriceDropNotification(context, product, newPrice, previousPrice, usersContainer);
      result.notificationSent = notificationSent;
    }

    return result;

  } catch (error) {
    context.log.error(`Error checking ${product.name}:`, error.message);
    throw error;
  }
}

async function scrapePrice(url, context) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      context.log(`HTTP error ${response.status} for ${url}`);
      return null;
    }

    const html = await response.text();
    
    // Try multiple price patterns
    const pricePatterns = [
      /\$[\d,]+\.?\d*/g,                                    // $123.45 or $1,234
      /"price":\s*"?\$?([\d,]+\.?\d*)"?/gi,                 // JSON price field
      /data-price="([\d.]+)"/gi,                            // data-price attribute
      /class="[^"]*price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/gi, // price class
      /itemprop="price"[^>]*content="([\d.]+)"/gi,          // Schema.org price
    ];

    let bestPrice = null;

    for (const pattern of pricePatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const priceStr = match[1] || match[0];
        const price = parseFloat(priceStr.replace(/[$,]/g, ''));
        if (price > 0 && price < 100000) { // Sanity check
          if (!bestPrice || price < bestPrice) {
            bestPrice = price;
          }
        }
      }
    }

    return bestPrice ? { price: bestPrice } : null;

  } catch (error) {
    context.log.error(`Scrape error for ${url}:`, error.message);
    return null;
  }
}

async function sendPriceDropNotification(context, product, newPrice, previousPrice, usersContainer) {
  try {
    // Get user info
    const { resource: user } = await usersContainer.item(product.userId, product.userId).read();
    
    if (!user || !user.email || user.emailNotifications === false) {
      context.log(`Skipping notification: user ${product.userId} has no email or notifications disabled`);
      return false;
    }

    const client = getEmailClient();
    if (!client) {
      context.log('Email client not configured');
      return false;
    }

    const savings = previousPrice ? Math.round(((previousPrice - newPrice) / previousPrice) * 100) : 0;
    const senderAddress = process.env.EMAIL_SENDER_ADDRESS || 'DoNotReply@pricewatch.com';

    const message = {
      senderAddress,
      content: {
        subject: `🎉 Price Drop Alert: ${product.name}`,
        plainText: `Great news! ${product.name} is now $${newPrice} (was $${previousPrice}). You're saving ${savings}%! View it here: ${product.url}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">🎉 Price Drop Alert!</h2>
            <p><strong>${product.name}</strong> has dropped in price!</p>
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 24px; color: #10b981;">
                <strong>$${newPrice}</strong>
                <span style="text-decoration: line-through; color: #9ca3af; margin-left: 10px;">$${previousPrice}</span>
              </p>
              <p style="margin: 10px 0 0; color: #059669;">You're saving ${savings}%!</p>
            </div>
            <p>Your target price was: <strong>$${product.targetPrice}</strong></p>
            <a href="${product.url}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 20px 0;">
              View Product →
            </a>
          </div>
        `
      },
      recipients: {
        to: [{ address: user.email }]
      }
    };

    const poller = await client.beginSend(message);
    await poller.pollUntilDone();

    context.log(`Notification sent to ${user.email} for ${product.name}`);
    return true;

  } catch (error) {
    context.log.error('Failed to send notification:', error.message);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
