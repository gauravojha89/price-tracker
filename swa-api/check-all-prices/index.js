const { CosmosClient } = require('@azure/cosmos');
const { EmailClient } = require("@azure/communication-email");

let productsContainer = null;
let usersContainer = null;

async function getContainers() {
  if (!productsContainer || !usersContainer) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    
    if (!endpoint) {
      throw new Error('COSMOS_ENDPOINT not configured');
    }
    
    const client = new CosmosClient({ endpoint, key });
    const database = client.database('pricetracker');
    productsContainer = database.container('products');
    usersContainer = database.container('users');
  }
  return { productsContainer, usersContainer };
}

module.exports = async function (context, req) {
  context.log('Check all prices triggered');
  
  const { userId } = req.body || {};
  
  try {
    const { productsContainer, usersContainer } = await getContainers();
    
    // Build query - if userId provided, check only their products
    let query = 'SELECT * FROM c';
    let parameters = [];
    
    if (userId) {
      query = 'SELECT * FROM c WHERE c.userId = @userId';
      parameters = [{ name: '@userId', value: userId }];
    }
    
    const { resources: products } = await productsContainer.items
      .query({ query, parameters })
      .fetchAll();
    
    if (products.length === 0) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { message: "No products to check", checked: 0 }
      };
      return;
    }
    
    context.log(`Checking prices for ${products.length} products`);
    
    const results = {
      checked: 0,
      updated: 0,
      priceDrops: 0,
      notificationsSent: 0,
      errors: 0,
      details: []
    };
    
    // Process products one at a time to avoid rate limiting
    for (const product of products) {
      try {
        const result = await checkProductPrice(context, product, productsContainer, usersContainer);
        results.checked++;
        
        if (result.updated) results.updated++;
        if (result.priceDrop) results.priceDrops++;
        if (result.notificationSent) results.notificationsSent++;
        
        results.details.push({
          id: product.id,
          name: product.name,
          ...result
        });
        
        // Small delay to avoid overwhelming servers
        await sleep(500);
        
      } catch (error) {
        context.log.error(`Error checking ${product.name}:`, error);
        results.errors++;
        results.details.push({
          id: product.id,
          name: product.name,
          error: error.message
        });
      }
    }
    
    context.log(`Price check complete: ${results.checked} checked, ${results.priceDrops} drops, ${results.notificationsSent} notifications`);
    
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: results
    };
    
  } catch (error) {
    context.log.error('Check all prices error:', error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: error.message }
    };
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkProductPrice(context, product, productsContainer, usersContainer) {
  const result = {
    url: product.url,
    previousPrice: product.currentPrice,
    updated: false,
    priceDrop: false,
    notificationSent: false
  };
  
  // Scrape current price
  const priceResult = await scrapePrice(product.url, context);
  
  if (priceResult.error) {
    result.error = priceResult.error;
    return result;
  }
  
  const newPrice = priceResult.price;
  result.currentPrice = newPrice;
  result.storeName = priceResult.storeName;
  
  // Check for changes
  const oldPrice = product.currentPrice;
  const targetPrice = product.targetPrice;
  const isOnSale = targetPrice && newPrice <= targetPrice;
  const priceDropped = oldPrice && newPrice < oldPrice;
  
  result.isOnSale = isOnSale;
  result.priceDrop = priceDropped;
  
  // Update price history
  const priceHistory = product.priceHistory || [];
  priceHistory.push({
    price: newPrice,
    date: new Date().toISOString()
  });
  
  // Keep last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const filteredHistory = priceHistory.filter(h => new Date(h.date) > ninetyDaysAgo);
  
  // Update product
  const updatedProduct = {
    ...product,
    currentPrice: newPrice,
    priceHistory: filteredHistory,
    isOnSale: isOnSale,
    lastChecked: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await productsContainer.items.upsert(updatedProduct);
  result.updated = true;
  
  // Send notification if price dropped below target
  if (isOnSale && shouldNotifyAgain(product.lastNotified)) {
    try {
      const { resources: users } = await usersContainer.items
        .query({
          query: 'SELECT * FROM c WHERE c.id = @userId',
          parameters: [{ name: '@userId', value: product.userId }]
        })
        .fetchAll();
      
      const user = users[0];
      if (user && user.email && user.emailNotifications !== false) {
        await sendPriceAlert(context, user.email, product, newPrice, result.storeName);
        
        updatedProduct.lastNotified = new Date().toISOString();
        await productsContainer.items.upsert(updatedProduct);
        
        result.notificationSent = true;
      }
    } catch (notifyError) {
      context.log.error('Notification error:', notifyError);
      result.notificationError = notifyError.message;
    }
  }
  
  return result;
}

function shouldNotifyAgain(lastNotified) {
  if (!lastNotified) return true;
  const lastTime = new Date(lastNotified);
  const now = new Date();
  const hoursSince = (now - lastTime) / (1000 * 60 * 60);
  return hoursSince >= 24;
}

async function scrapePrice(url, context) {
  try {
    const storeInfo = detectStore(url);
    // Allow any URL - no store restriction
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    
    const html = await response.text();
    const priceData = extractPrice(html, storeInfo.name);
    
    if (!priceData.price) {
      return { error: 'Price not found', storeName: storeInfo.name };
    }
    
    return {
      price: priceData.price,
      title: priceData.title,
      storeName: storeInfo.name
    };
    
  } catch (error) {
    return { error: error.message };
  }
}

function detectStore(url) {
  const urlLower = url.toLowerCase();
  
  const stores = [
    { patterns: ['amazon.com', 'amazon.co'], name: 'Amazon' },
    { patterns: ['bestbuy.com'], name: 'Best Buy' },
    { patterns: ['target.com'], name: 'Target' },
    { patterns: ['walmart.com'], name: 'Walmart' },
    { patterns: ['costco.com'], name: 'Costco' },
    { patterns: ['homedepot.com'], name: 'Home Depot' },
    { patterns: ['lowes.com'], name: 'Lowes' },
    { patterns: ['newegg.com'], name: 'Newegg' },
    { patterns: ['bhphotovideo.com'], name: 'B&H Photo' },
    { patterns: ['apple.com'], name: 'Apple' },
    { patterns: ['microcenter.com'], name: 'Micro Center' },
    { patterns: ['gilt.com'], name: 'Gilt' },
    { patterns: ['macys.com'], name: 'Macys' },
    { patterns: ['nordstrom.com'], name: 'Nordstrom' },
    { patterns: ['kohls.com'], name: 'Kohls' },
    { patterns: ['ebay.com'], name: 'eBay' },
    { patterns: ['sephora.com'], name: 'Sephora' },
    { patterns: ['ulta.com'], name: 'Ulta' },
    { patterns: ['zappos.com'], name: 'Zappos' },
    { patterns: ['6pm.com'], name: '6pm' },
    { patterns: ['samsung.com'], name: 'Samsung' },
    { patterns: ['dell.com'], name: 'Dell' },
    { patterns: ['hp.com'], name: 'HP' },
    { patterns: ['lenovo.com'], name: 'Lenovo' }
  ];
  
  for (const store of stores) {
    if (store.patterns.some(p => urlLower.includes(p))) {
      return { supported: true, name: store.name, domain: new URL(url).hostname };
    }
  }
  
  // For unknown stores, use the domain name
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const storeName = domain.split('.')[0];
    return { supported: true, name: storeName.charAt(0).toUpperCase() + storeName.slice(1), domain };
  } catch {
    return { supported: true, name: 'Unknown Store', domain: url };
  }
}

function extractPrice(html, storeName) {
  let price = null;
  let title = null;
  
  const pricePatterns = [
    /"price":\s*"?([\d,]+\.?\d*)"/i,
    /"priceAmount":\s*"?([\d,]+\.?\d*)"/i,
    /class="[^"]*price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /data-price="([\d,]+\.?\d*)"/i,
    /itemprop="price"[^>]*content="([\d,]+\.?\d*)"/i,
    /\$\s?([\d,]+\.?\d{2})/
  ];
  
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
        price = parsed;
        break;
      }
    }
  }
  
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim().substring(0, 200);
  }
  
  return { price, title };
}

async function sendPriceAlert(context, email, product, newPrice, storeName) {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderEmail = process.env.ACS_SENDER_EMAIL || "DoNotReply@d4972e00-557a-4f16-acb7-7903737a1477.azurecomm.net";
  
  if (!connectionString) {
    throw new Error('ACS_CONNECTION_STRING not configured');
  }
  
  const emailClient = new EmailClient(connectionString);
  const savings = product.targetPrice ? (((product.targetPrice - newPrice) / product.targetPrice) * 100).toFixed(0) : 0;
  const storeDisplay = storeName || 'Store';
  
  const emailMessage = {
    senderAddress: senderEmail,
    content: {
      subject: `🎉 Price Drop: ${product.name} is now $${newPrice}!`,
      plainText: `${product.name} dropped to $${newPrice} (target: $${product.targetPrice}). Save ${savings}%! ${product.url}`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table style="max-width: 500px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="padding: 32px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
          <h1 style="margin: 0; color: white; font-size: 24px;">🎉 Price Drop!</h1>
        </td></tr>
        <tr><td style="padding: 32px; text-align: center;">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #1f2937;">${product.name}</h2>
          <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="font-size: 36px; font-weight: 700; color: #059669;">$${newPrice}</div>
            <div style="font-size: 14px; color: #6b7280; margin-top: 8px;">
              Target: <s>$${product.targetPrice}</s> <span style="color: #059669; font-weight: 600;">Save ${savings}%</span>
            </div>
          </div>
          <a href="${product.url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Buy Now at ${storeDisplay} →</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()
    },
    recipients: { to: [{ address: email }] }
  };
  
  const poller = await emailClient.beginSend(emailMessage);
  await poller.pollUntilDone();
  context.log(`Alert sent to ${email}`);
}
