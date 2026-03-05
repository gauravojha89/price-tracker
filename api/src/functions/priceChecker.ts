import { app, InvocationContext, Timer } from '@azure/functions'
import { v4 as uuidv4 } from 'uuid'
import databaseService from '../services/database.js'
import priceScraper from '../services/priceScraper.js'
import notificationService from '../services/notification.js'
import { PriceAlert } from '../models/index.js'

// Runs daily at 6 AM UTC
async function priceChecker(_timer: Timer, context: InvocationContext): Promise<void> {
  context.log('Starting daily price check...')
  
  try {
    // Get all products
    const products = await databaseService.getAllProducts()
    context.log(`Found ${products.length} products to check`)
    
    let checked = 0
    let priceDrops = 0
    let errors = 0
    
    for (const product of products) {
      try {
        if (!product.url) {
          continue
        }
        
        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const previousPrice = product.currentPrice
        const scrapeResult = await priceScraper.scrapePrice(product.url)
        
        if (!scrapeResult.success || !scrapeResult.price) {
          context.log(`Failed to scrape ${product.name}: ${scrapeResult.error}`)
          errors++
          continue
        }
        
        const now = new Date().toISOString()
        const currentPrice = scrapeResult.price
        const isOnSale = currentPrice < product.originalPrice
        
        // Update product
        await databaseService.updateProduct(product.id, product.userId, {
          currentPrice,
          isOnSale,
          lastChecked: now,
          priceHistory: [
            ...product.priceHistory,
            { price: currentPrice, date: now },
          ].slice(-90),
        })
        
        checked++
        
        // Check if price dropped and send notification
        if (currentPrice < previousPrice) {
          priceDrops++
          context.log(`Price drop detected for ${product.name}: ${previousPrice} -> ${currentPrice}`)
          
          // Get user to send notification
          const user = await databaseService.getUser(product.userId)
          
          if (user) {
            // Create alert record
            const alert: PriceAlert = {
              id: uuidv4(),
              productId: product.id,
              userId: user.id,
              productName: product.name,
              previousPrice,
              currentPrice,
              discount: Math.round(((previousPrice - currentPrice) / previousPrice) * 100),
              store: product.store,
              alertedAt: now,
              notificationSent: false,
            }
            
            await databaseService.createAlert(alert)
            
            // Send notification
            const notifResult = await notificationService.sendPriceAlert(user, {
              ...product,
              currentPrice,
            }, previousPrice)
            
            if (notifResult.success) {
              await databaseService.markAlertSent(alert.id, user.id)
              context.log(`Notification sent to ${user.email}`)
            } else {
              context.log(`Failed to send notification: ${notifResult.error}`)
            }
          }
        }
      } catch (productError) {
        context.log(`Error checking product ${product.id}: ${productError}`)
        errors++
      }
    }
    
    context.log(`Price check complete. Checked: ${checked}, Price drops: ${priceDrops}, Errors: ${errors}`)
  } catch (error) {
    context.error('Price checker failed:', error)
    throw error
  }
}

app.timer('priceChecker', {
  schedule: '0 0 6 * * *', // 6 AM UTC daily
  handler: priceChecker,
  runOnStartup: false,
})

// Manual trigger for testing (protected endpoint - would need auth in production)
app.http('triggerPriceCheck', {
  methods: ['POST'],
  authLevel: 'function', // Requires function key
  route: 'admin/check-prices',
  handler: async (request, context) => {
    // Run price check
    await priceChecker({} as Timer, context)
    
    return {
      status: 200,
      body: JSON.stringify({ success: true, message: 'Price check triggered' }),
      headers: { 'Content-Type': 'application/json' },
    }
  },
})
