export interface User {
  id: string
  email: string
  name: string
  phoneNumber?: string | null
  notificationPreference: 'email' | 'sms' | 'both'
  createdAt?: string
  updatedAt?: string
}

export interface Product {
  id: string
  userId: string
  name: string
  url?: string | null
  store?: string
  originalPrice?: number | null
  currentPrice?: number | null
  targetPrice?: number | null
  currency?: string
  imageUrl?: string | null
  isOnSale: boolean
  priceHistory: PricePoint[]
  createdAt: string
  updatedAt: string
  lastChecked?: string | null
}

export interface PricePoint {
  price: number
  date: string
}

export interface CreateProductRequest {
  name: string
  url?: string
}

export interface UpdateUserRequest {
  name?: string
  email?: string
  phoneNumber?: string
  notificationPreference?: 'email' | 'sms' | 'both'
  emailNotifications?: boolean
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PriceAlert {
  id: string
  productId: string
  productName: string
  previousPrice: number
  currentPrice: number
  discount: number
  store: string
  alertedAt: string
}
