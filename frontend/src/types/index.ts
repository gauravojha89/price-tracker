export interface User {
  id: string
  email: string
  name: string
  phoneNumber?: string
  notificationPreference: 'email' | 'sms' | 'both'
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  userId: string
  name: string
  url?: string
  store: string
  originalPrice: number
  currentPrice: number
  targetPrice?: number
  currency: string
  imageUrl?: string
  isOnSale: boolean
  priceHistory: PricePoint[]
  createdAt: string
  updatedAt: string
  lastChecked: string
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
  phoneNumber?: string
  notificationPreference?: 'email' | 'sms' | 'both'
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
