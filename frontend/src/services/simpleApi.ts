// Simple API service that doesn't require authentication
// For demo mode - directly calls API endpoints

import type { Product, User } from '../types'

const API_BASE = '/api'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { 
        success: false, 
        error: errorData.error || `Request failed: ${response.status}` 
      }
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { success: true }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('API Error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Network error' 
    }
  }
}

// Products API
export async function getProducts(): Promise<ApiResponse<Product[]>> {
  return request<Product[]>('/products')
}

export async function createProduct(data: { 
  name: string
  url?: string
  targetPrice?: number 
}): Promise<ApiResponse<Product>> {
  return request<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteProduct(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/products/${id}`, {
    method: 'DELETE',
  })
}

export async function refreshPrice(id: string): Promise<ApiResponse<{
  success: boolean
  currentPrice?: number
  previousPrice?: number
  isOnSale?: boolean
  productUpdated?: boolean
  error?: string
}>> {
  return request('/check-price', {
    method: 'POST',
    body: JSON.stringify({ productId: id }),
  })
}

// User Profile API
export async function getProfile(): Promise<ApiResponse<User>> {
  return request<User>('/user/profile')
}

export async function updateProfile(data: {
  name?: string
  email?: string
  emailNotifications?: boolean
}): Promise<ApiResponse<User>> {
  return request<User>('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Price checking
export async function checkPrice(productId: string): Promise<ApiResponse<{
  success: boolean
  price?: number
  previousPrice?: number
  isOnSale?: boolean
  notificationSent?: boolean
  error?: string
}>> {
  return request('/check-price', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  })
}

export async function checkAllPrices(): Promise<ApiResponse<{
  checked: number
  updated: number
  priceDrops: number
  notificationsSent: number
  errors: number
}>> {
  return request('/check-all-prices', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function testNotification(email: string): Promise<ApiResponse<{
  success: boolean
  message: string
}>> {
  return request('/notifications/test', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export interface StoreSearchResult {
  store: string
  icon: string
  searchUrl: string
  description: string
}

export async function searchStores(productName: string): Promise<ApiResponse<{
  query: string
  results: StoreSearchResult[]
}>> {
  return request('/search-stores', {
    method: 'POST',
    body: JSON.stringify({ productName }),
  })
}

export default {
  getProducts,
  createProduct,
  deleteProduct,
  refreshPrice,
  getProfile,
  updateProfile,
  checkPrice,
  checkAllPrices,
  testNotification,
  searchStores,
}
