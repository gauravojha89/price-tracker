import { z } from 'zod'

// User schema with validation
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().max(320),
  name: z.string().max(100).optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  notificationPreference: z.enum(['email', 'sms', 'both']).default('email'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

// Product schema
export const ProductSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(500),
  url: z.string().url().max(2000).optional(),
  store: z.string().max(100),
  originalPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  targetPrice: z.number().positive().optional(),
  currency: z.string().length(3).default('USD'),
  imageUrl: z.string().url().max(2000).optional(),
  isOnSale: z.boolean().default(false),
  priceHistory: z.array(z.object({
    price: z.number().positive(),
    date: z.string().datetime(),
  })).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastChecked: z.string().datetime(),
})

export type Product = z.infer<typeof ProductSchema>

// Request schemas
export const CreateProductRequestSchema = z.object({
  name: z.string().min(1).max(500),
  url: z.string().url().max(2000).optional(),
})

export const UpdateUserRequestSchema = z.object({
  name: z.string().max(100).optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional().nullable(),
  notificationPreference: z.enum(['email', 'sms', 'both']).optional(),
})

export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>

// Price alert schema
export const PriceAlertSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  userId: z.string().uuid(),
  productName: z.string(),
  previousPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  discount: z.number(),
  store: z.string(),
  alertedAt: z.string().datetime(),
  notificationSent: z.boolean().default(false),
})

export type PriceAlert = z.infer<typeof PriceAlertSchema>

// Supported stores
export const SUPPORTED_STORES = [
  { name: 'Amazon', domain: 'amazon.com', pattern: /amazon\.com/i },
  { name: 'Best Buy', domain: 'bestbuy.com', pattern: /bestbuy\.com/i },
  { name: 'Target', domain: 'target.com', pattern: /target\.com/i },
  { name: 'Walmart', domain: 'walmart.com', pattern: /walmart\.com/i },
  { name: 'Costco', domain: 'costco.com', pattern: /costco\.com/i },
  { name: 'Apple', domain: 'apple.com', pattern: /apple\.com/i },
  { name: 'Newegg', domain: 'newegg.com', pattern: /newegg\.com/i },
  { name: "Macy's", domain: 'macys.com', pattern: /macys\.com/i },
  { name: 'Nordstrom', domain: 'nordstrom.com', pattern: /nordstrom\.com/i },
  { name: 'Home Depot', domain: 'homedepot.com', pattern: /homedepot\.com/i },
]

export function identifyStore(url: string): string | null {
  for (const store of SUPPORTED_STORES) {
    if (store.pattern.test(url)) {
      return store.name
    }
  }
  return null
}
