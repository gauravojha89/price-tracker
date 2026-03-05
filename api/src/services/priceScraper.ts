import axios from 'axios'
import * as cheerio from 'cheerio'
import sanitizeHtml from 'sanitize-html'
import { identifyStore } from '../models/index.js'

interface PriceResult {
  success: boolean
  price?: number
  currency?: string
  productName?: string
  imageUrl?: string
  store?: string
  error?: string
}

interface SearchResult {
  success: boolean
  products?: Array<{
    name: string
    price: number
    currency: string
    store: string
    url: string
    imageUrl?: string
  }>
  error?: string
}

// Rate limiting: store last request time per domain
const lastRequestTime: Record<string, number> = {}
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests to same domain

async function rateLimitedRequest(url: string): Promise<string> {
  const domain = new URL(url).hostname
  const now = Date.now()
  const lastTime = lastRequestTime[domain] || 0
  
  if (now - lastTime < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - (now - lastTime)))
  }
  
  lastRequestTime[domain] = Date.now()
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    },
    timeout: 15000,
    maxRedirects: 5,
  })
  
  return response.data
}

export async function scrapePrice(url: string): Promise<PriceResult> {
  try {
    // Validate URL
    const parsedUrl = new URL(url)
    
    // Only allow HTTPS
    if (parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'Only HTTPS URLs are supported' }
    }
    
    // Check if store is supported
    const store = identifyStore(url)
    if (!store) {
      return { success: false, error: 'Store not supported' }
    }
    
    const html = await rateLimitedRequest(url)
    const $ = cheerio.load(html)
    
    let price: number | undefined
    let productName: string | undefined
    let imageUrl: string | undefined
    let currency = 'USD'
    
    // Store-specific price extraction
    switch (store) {
      case 'Amazon':
        price = extractAmazonPrice($)
        productName = sanitizeText($('#productTitle').text())
        imageUrl = $('#landingImage').attr('src')
        break
        
      case 'Best Buy':
        price = extractBestBuyPrice($)
        productName = sanitizeText($('.sku-title h1').text())
        imageUrl = $('.primary-image').attr('src')
        break
        
      case 'Target':
        price = extractTargetPrice($)
        productName = sanitizeText($('[data-test="product-title"]').text())
        imageUrl = $('img[data-test="product-image"]').attr('src')
        break
        
      case 'Walmart':
        price = extractWalmartPrice($)
        productName = sanitizeText($('[itemprop="name"]').text() || $('h1').first().text())
        imageUrl = $('[data-testid="hero-image"] img').attr('src')
        break
        
      case 'Costco':
        price = extractCostcoPrice($)
        productName = sanitizeText($('h1[itemprop="name"]').text())
        imageUrl = $('img.product-image').attr('src')
        break
        
      default:
        price = extractGenericPrice($)
        productName = sanitizeText($('h1').first().text())
    }
    
    if (price === undefined || price <= 0) {
      return { success: false, error: 'Could not extract price from page' }
    }
    
    return {
      success: true,
      price,
      currency,
      productName: productName || undefined,
      imageUrl: imageUrl || undefined,
      store,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scrape price'
    return { success: false, error: message }
  }
}

function extractAmazonPrice($: cheerio.CheerioAPI): number | undefined {
  // Try various Amazon price selectors
  const selectors = [
    '.a-price .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    '.a-price-whole',
    '[data-a-color="price"] .a-offscreen',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function extractBestBuyPrice($: cheerio.CheerioAPI): number | undefined {
  const selectors = [
    '[data-testid="customer-price"] span',
    '.priceView-hero-price span',
    '.pricing-price__regular-price',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function extractTargetPrice($: cheerio.CheerioAPI): number | undefined {
  const selectors = [
    '[data-test="product-price"]',
    '.styles_currentPrice',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function extractWalmartPrice($: cheerio.CheerioAPI): number | undefined {
  const selectors = [
    '[itemprop="price"]',
    '[data-testid="price-wrap"] span',
    '.price-characteristic',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function extractCostcoPrice($: cheerio.CheerioAPI): number | undefined {
  const selectors = [
    '.your-price span',
    '.value',
    '.price',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function extractGenericPrice($: cheerio.CheerioAPI): number | undefined {
  // Try generic price selectors
  const selectors = [
    '[itemprop="price"]',
    '.price',
    '.product-price',
    '[class*="price"]',
  ]
  
  for (const selector of selectors) {
    const text = $(selector).first().text()
    const price = parsePrice(text)
    if (price) return price
  }
  
  return undefined
}

function parsePrice(text: string): number | undefined {
  if (!text) return undefined
  
  // Remove currency symbols and clean up
  const cleaned = text
    .replace(/[^0-9.,]/g, '')
    .replace(/,/g, '')
    .trim()
  
  const price = parseFloat(cleaned)
  
  if (isNaN(price) || price <= 0) return undefined
  
  return Math.round(price * 100) / 100 // Round to 2 decimal places
}

function sanitizeText(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim()
}

// Search for products across supported stores (placeholder - would use APIs in production)
export async function searchProducts(query: string): Promise<SearchResult> {
  // In a production environment, this would use store APIs or a product database
  // For now, return empty results - the user should provide a direct URL
  return {
    success: true,
    products: [],
  }
}

export default { scrapePrice, searchProducts }
