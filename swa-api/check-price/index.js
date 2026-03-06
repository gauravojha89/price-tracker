const { CosmosClient } = require('@azure/cosmos');
const { EmailClient } = require("@azure/communication-email");
const { requireAuth, getUserId } = require('../shared/auth');

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
  context.log('Check price function triggered');
  
  // Require authentication
  const authError = await requireAuth(req, context);
  if (authError) {
    context.res = authError;
    return;
  }
  
  const userId = await getUserId(req, context);
  const { productId, url } = req.body || {};
  
  if (!productId && !url) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Provide productId or url" }
    };
    return;
  }
  
  try {
    const { productsContainer, usersContainer } = await getContainers();
    
    // If productId provided, fetch product from DB (only if owned by user)
    let product = null;
    if (productId) {
      const { resources } = await productsContainer.items
        .query({
          query: 'SELECT * FROM c WHERE c.id = @id AND c.userId = @userId',
          parameters: [
            { name: '@id', value: productId },
            { name: '@userId', value: userId }
          ]
        })
        .fetchAll();
      product = resources[0];
    }
    
    const checkUrl = product ? product.url : url;
    
    // Scrape the price
    const priceResult = await scrapePrice(checkUrl, context);
    
    if (priceResult.error) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { 
          success: false, 
          error: priceResult.error,
          url: checkUrl,
          suggestion: "Try entering the price manually"
        }
      };
      return;
    }
    
    const newPrice = priceResult.price;
    const result = {
      url: checkUrl,
      price: newPrice,
      storeName: priceResult.storeName,
      productTitle: priceResult.title,
      scrapedAt: new Date().toISOString()
    };
    
    // If we have a product, update it and check for price drops
    if (product) {
      const oldPrice = product.currentPrice;
      const targetPrice = product.targetPrice;
      const isOnSale = targetPrice && newPrice <= targetPrice;
      const priceDropped = oldPrice && newPrice < oldPrice;
      
      // Update price history
      const priceHistory = product.priceHistory || [];
      priceHistory.push({
        price: newPrice,
        date: new Date().toISOString()
      });
      
      // Keep last 90 days of history
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const filteredHistory = priceHistory.filter(h => new Date(h.date) > ninetyDaysAgo);
      
      // Update product in DB
      const updatedProduct = {
        ...product,
        currentPrice: newPrice,
        priceHistory: filteredHistory,
        isOnSale: isOnSale,
        lastChecked: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await productsContainer.items.upsert(updatedProduct);
      
      result.previousPrice = oldPrice;
      result.targetPrice = targetPrice;
      result.isOnSale = isOnSale;
      result.priceDropped = priceDropped;
      result.productUpdated = true;
      
      // Send notification if price dropped below target
      if (isOnSale && (!product.lastNotified || shouldNotifyAgain(product.lastNotified))) {
        try {
          // Get user email
          const { resources: users } = await usersContainer.items
            .query({
              query: 'SELECT * FROM c WHERE c.id = @userId',
              parameters: [{ name: '@userId', value: product.userId }]
            })
            .fetchAll();
          
          const user = users[0];
          if (user && user.email) {
            await sendPriceAlert(context, user.email, product, newPrice);
            
            // Update last notified
            updatedProduct.lastNotified = new Date().toISOString();
            await productsContainer.items.upsert(updatedProduct);
            
            result.notificationSent = true;
            result.notifiedEmail = user.email;
          }
        } catch (notifyError) {
          context.log.error('Failed to send notification:', notifyError);
          result.notificationError = notifyError.message;
        }
      }
    }
    
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true, ...result }
    };
    
  } catch (error) {
    context.log.error('Check price error:', error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: error.message }
    };
  }
};

// Determine if we should send another notification (not more than once per 24 hours)
function shouldNotifyAgain(lastNotified) {
  if (!lastNotified) return true;
  const lastTime = new Date(lastNotified);
  const now = new Date();
  const hoursSince = (now - lastTime) / (1000 * 60 * 60);
  return hoursSince >= 24;
}

// Price scraping function
async function scrapePrice(url, context) {
  try {
    // Determine store from URL
    const storeInfo = detectStore(url);
    // Allow any URL - no store restriction
    
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      return { error: `Failed to fetch page: ${response.status}` };
    }
    
    const html = await response.text();
    
    // Extract price based on store
    const priceData = extractPrice(html, storeInfo.name);
    
    if (!priceData.price) {
      return { 
        error: 'Could not find price on page. The product may be unavailable or the page format may have changed.',
        storeName: storeInfo.name
      };
    }
    
    return {
      price: priceData.price,
      title: priceData.title,
      storeName: storeInfo.name
    };
    
  } catch (error) {
    context.log.error('Scrape error:', error);
    return { error: `Failed to scrape price: ${error.message}` };
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
  
  // Common price patterns
  const pricePatterns = [
    // JSON-LD structured data (most reliable)
    /"price":\s*"?([\d,]+\.?\d*)"/i,
    /"priceAmount":\s*"?([\d,]+\.?\d*)"/i,
    
    // Common price class patterns
    /class="[^"]*price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /data-price="([\d,]+\.?\d*)"/i,
    /itemprop="price"[^>]*content="([\d,]+\.?\d*)"/i,
    
    // Store-specific patterns
    /id="priceblock_ourprice"[^>]*>\s*\$?([\d,]+\.?\d*)/i, // Amazon
    /class="priceView-customer-price"[^>]*>.*?\$?([\d,]+\.?\d*)/i, // Best Buy
    /data-test="product-price"[^>]*>\s*\$?([\d,]+\.?\d*)/i, // Target
    /itemprop="price"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /class="[^"]*current-price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
    
    // Generic dollar amount
    /\$\s?([\d,]+\.?\d{2})/
  ];
  
  // Try each pattern
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0 && parsed < 100000) { // Sanity check
        price = parsed;
        break;
      }
    }
  }
  
  // Try to extract title
  const titlePatterns = [
    /<title>([^<]+)<\/title>/i,
    /itemprop="name"[^>]*>([^<]+)</i,
    /"name":\s*"([^"]+)"/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      title = match[1].trim().substring(0, 200);
      break;
    }
  }
  
  return { price, title };
}

async function sendPriceAlert(context, email, product, newPrice) {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderEmail = process.env.ACS_SENDER_EMAIL || "DoNotReply@d4972e00-557a-4f16-acb7-7803737a1477.azurecomm.net";
  
  if (!connectionString) {
    throw new Error('ACS_CONNECTION_STRING not configured');
  }
  
  const emailClient = new EmailClient(connectionString);
  
  const savings = product.targetPrice ? (((product.targetPrice - newPrice) / product.targetPrice) * 100).toFixed(0) : 0;
  
  const emailMessage = {
    senderAddress: senderEmail,
    content: {
      subject: `🎉 Price Drop Alert: ${product.name}`,
      plainText: `Great news! ${product.name} is now $${newPrice} (your target was $${product.targetPrice}). Save ${savings}%! Check it out: ${product.url}`,
      html: buildAlertEmailHtml(product, newPrice, savings)
    },
    recipients: {
      to: [{ address: email }]
    }
  };
  
  const poller = await emailClient.beginSend(emailMessage);
  await poller.pollUntilDone();
  
  context.log(`Price alert sent to ${email} for ${product.name}`);
}

function buildAlertEmailHtml(product, newPrice, savings) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 32px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">🎉 Price Drop!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 18px; color: #1f2937;">${product.name}</h2>
              
              <table width="100%" style="background: #f0fdf4; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Now Only</div>
                    <div style="font-size: 36px; font-weight: 700; color: #059669;">$${newPrice}</div>
                    <div style="font-size: 14px; color: #6b7280; margin-top: 12px;">
                      Target: <span style="text-decoration: line-through;">$${product.targetPrice}</span>
                      <span style="color: #059669; font-weight: 600; margin-left: 8px;">Save ${savings}%</span>
                    </div>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${product.url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Buy Now →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">PriceWatch Alert • <a href="https://delightful-glacier-06ac71a1e.2.azurestaticapps.net" style="color: #0ea5e9;">Manage alerts</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
