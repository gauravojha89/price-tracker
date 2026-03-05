import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthError } from '../services/auth.js'
import databaseService from '../services/database.js'
import priceScraper from '../services/priceScraper.js'
import { CreateProductRequestSchema, Product, identifyStore } from '../models/index.js'
import { successResponse, errorResponse, validateId } from '../utils/response.js'

// GET /api/products - Get all products for user
async function getProducts(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    
    const user = await databaseService.getUserByEmail(auth.email!)
    if (!user) {
      return successResponse([])
    }
    
    const products = await databaseService.getProductsByUser(user.id)
    return successResponse(products)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to get products', 500)
  }
}

// POST /api/products - Create a new product
async function createProduct(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    
    const body = await request.json() as Record<string, unknown>
    
    // Validate request
    const parseResult = CreateProductRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse('Invalid request: ' + parseResult.error.message, 400)
    }
    
    const { name, url } = parseResult.data
    
    // Get or create user
    let user = await databaseService.getUserByEmail(auth.email!)
    if (!user) {
      const now = new Date().toISOString()
      user = await databaseService.createUser({
        id: uuidv4(),
        email: auth.email!,
        name: auth.name,
        notificationPreference: 'email',
        createdAt: now,
        updatedAt: now,
      })
    }
    
    // Check product limit (prevent abuse)
    const existingProducts = await databaseService.getProductsByUser(user.id)
    if (existingProducts.length >= 50) {
      return errorResponse('Maximum of 50 products allowed', 400)
    }
    
    let store = 'Unknown'
    let price = 0
    let productName = name
    let imageUrl: string | undefined
    let currency = 'USD'
    
    // If URL provided, scrape the price
    if (url) {
      const identifiedStore = identifyStore(url)
      if (!identifiedStore) {
        return errorResponse('Store not supported. Supported stores: Amazon, Best Buy, Target, Walmart, Costco, Apple, Newegg, Macy\'s, Nordstrom, Home Depot', 400)
      }
      
      const scrapeResult = await priceScraper.scrapePrice(url)
      if (!scrapeResult.success || !scrapeResult.price) {
        return errorResponse(scrapeResult.error || 'Failed to get price from URL', 400)
      }
      
      store = scrapeResult.store || identifiedStore
      price = scrapeResult.price
      productName = scrapeResult.productName || name
      imageUrl = scrapeResult.imageUrl
      currency = scrapeResult.currency || 'USD'
    } else {
      // If no URL, user must provide a valid price later (or we search)
      return errorResponse('Please provide a product URL to track', 400)
    }
    
    const now = new Date().toISOString()
    const product: Product = {
      id: uuidv4(),
      userId: user.id,
      name: productName,
      url,
      store,
      originalPrice: price,
      currentPrice: price,
      currency,
      imageUrl,
      isOnSale: false,
      priceHistory: [{ price, date: now }],
      createdAt: now,
      updatedAt: now,
      lastChecked: now,
    }
    
    const created = await databaseService.createProduct(product)
    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    console.error('Failed to create product:', error)
    return errorResponse('Failed to create product', 500)
  }
}

// GET /api/products/{id} - Get a specific product
async function getProduct(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    const productId = request.params.id
    
    if (!productId || !validateId(productId)) {
      return errorResponse('Invalid product ID', 400)
    }
    
    const user = await databaseService.getUserByEmail(auth.email!)
    if (!user) {
      return errorResponse('Product not found', 404)
    }
    
    const product = await databaseService.getProduct(productId, user.id)
    if (!product) {
      return errorResponse('Product not found', 404)
    }
    
    return successResponse(product)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to get product', 500)
  }
}

// DELETE /api/products/{id} - Delete a product
async function deleteProduct(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    const productId = request.params.id
    
    if (!productId || !validateId(productId)) {
      return errorResponse('Invalid product ID', 400)
    }
    
    const user = await databaseService.getUserByEmail(auth.email!)
    if (!user) {
      return errorResponse('Product not found', 404)
    }
    
    // Verify product belongs to user
    const product = await databaseService.getProduct(productId, user.id)
    if (!product) {
      return errorResponse('Product not found', 404)
    }
    
    await databaseService.deleteProduct(productId, user.id)
    return successResponse({ deleted: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to delete product', 500)
  }
}

// POST /api/products/{id}/refresh - Refresh product price
async function refreshProductPrice(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    const productId = request.params.id
    
    if (!productId || !validateId(productId)) {
      return errorResponse('Invalid product ID', 400)
    }
    
    const user = await databaseService.getUserByEmail(auth.email!)
    if (!user) {
      return errorResponse('Product not found', 404)
    }
    
    const product = await databaseService.getProduct(productId, user.id)
    if (!product) {
      return errorResponse('Product not found', 404)
    }
    
    if (!product.url) {
      return errorResponse('Product does not have a URL to check', 400)
    }
    
    const scrapeResult = await priceScraper.scrapePrice(product.url)
    if (!scrapeResult.success || !scrapeResult.price) {
      return errorResponse(scrapeResult.error || 'Failed to get current price', 400)
    }
    
    const now = new Date().toISOString()
    const isOnSale = scrapeResult.price < product.originalPrice
    
    const updatedProduct = await databaseService.updateProduct(productId, user.id, {
      currentPrice: scrapeResult.price,
      isOnSale,
      lastChecked: now,
      priceHistory: [
        ...product.priceHistory,
        { price: scrapeResult.price, date: now },
      ].slice(-90), // Keep last 90 days
    })
    
    return successResponse(updatedProduct)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to refresh price', 500)
  }
}

// Register function handlers
app.http('getProducts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products',
  handler: getProducts,
})

app.http('createProduct', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'products',
  handler: createProduct,
})

app.http('getProduct', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products/{id}',
  handler: getProduct,
})

app.http('deleteProduct', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'products/{id}',
  handler: deleteProduct,
})

app.http('refreshProductPrice', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'products/{id}/refresh',
  handler: refreshProductPrice,
})
