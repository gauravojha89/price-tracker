import { PublicClientApplication } from '@azure/msal-browser'
import { apiConfig } from './authConfig'
import type { 
  User, 
  Product, 
  CreateProductRequest, 
  UpdateUserRequest, 
  ApiResponse 
} from '../types'

class ApiService {
  private baseUrl: string
  private msalInstance: PublicClientApplication | null = null

  constructor() {
    this.baseUrl = apiConfig.uri
  }

  setMsalInstance(instance: PublicClientApplication) {
    this.msalInstance = instance
  }

  private async getAccessToken(): Promise<string> {
    if (!this.msalInstance) {
      throw new Error('MSAL instance not initialized')
    }

    const accounts = this.msalInstance.getAllAccounts()
    if (accounts.length === 0) {
      throw new Error('No authenticated user')
    }

    try {
      const response = await this.msalInstance.acquireTokenSilent({
        scopes: apiConfig.scopes,
        account: accounts[0],
      })
      return response.accessToken
    } catch {
      // If silent acquisition fails, redirect to login
      await this.msalInstance.acquireTokenRedirect({
        scopes: apiConfig.scopes,
      })
      throw new Error('Token acquisition redirected')
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const token = await this.getAccessToken()
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.message || `Request failed with status ${response.status}`,
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      }
    }
  }

  // User endpoints
  async getProfile(): Promise<ApiResponse<User>> {
    return this.request<User>('/user/profile')
  }

  async updateProfile(data: UpdateUserRequest): Promise<ApiResponse<User>> {
    return this.request<User>('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // Product endpoints
  async getProducts(): Promise<ApiResponse<Product[]>> {
    return this.request<Product[]>('/products')
  }

  async getProduct(id: string): Promise<ApiResponse<Product>> {
    return this.request<Product>(`/products/${encodeURIComponent(id)}`)
  }

  async createProduct(data: CreateProductRequest): Promise<ApiResponse<Product>> {
    return this.request<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteProduct(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  async refreshPrice(id: string): Promise<ApiResponse<Product>> {
    return this.request<Product>(`/products/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
    })
  }
}

export const apiService = new ApiService()
export default apiService
