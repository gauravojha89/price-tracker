import { CosmosClient, Container, Database } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import { User, Product, PriceAlert } from '../models/index.js'

class DatabaseService {
  private client: CosmosClient | null = null
  private database: Database | null = null
  private usersContainer: Container | null = null
  private productsContainer: Container | null = null
  private alertsContainer: Container | null = null
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    const endpoint = process.env.COSMOS_DB_ENDPOINT
    const databaseId = process.env.COSMOS_DB_DATABASE || 'pricetracker'

    if (!endpoint) {
      throw new Error('COSMOS_DB_ENDPOINT environment variable is required')
    }

    // Use Managed Identity for authentication (no connection strings!)
    const credential = new DefaultAzureCredential()
    this.client = new CosmosClient({ endpoint, aadCredentials: credential })
    
    this.database = this.client.database(databaseId)
    this.usersContainer = this.database.container('users')
    this.productsContainer = this.database.container('products')
    this.alertsContainer = this.database.container('alerts')
    
    this.initialized = true
  }

  // User operations
  async getUser(id: string): Promise<User | null> {
    await this.initialize()
    try {
      const { resource } = await this.usersContainer!.item(id, id).read<User>()
      return resource || null
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 404) return null
      throw error
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    await this.initialize()
    const query = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }],
    }
    const { resources } = await this.usersContainer!.items.query<User>(query).fetchAll()
    return resources[0] || null
  }

  async createUser(user: User): Promise<User> {
    await this.initialize()
    const { resource } = await this.usersContainer!.items.create(user)
    return resource as User
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    await this.initialize()
    const existingUser = await this.getUser(id)
    if (!existingUser) throw new Error('User not found')

    const updatedUser = {
      ...existingUser,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const { resource } = await this.usersContainer!.item(id, id).replace(updatedUser)
    return resource as User
  }

  // Product operations
  async getProduct(id: string, userId: string): Promise<Product | null> {
    await this.initialize()
    try {
      const { resource } = await this.productsContainer!.item(id, userId).read<Product>()
      return resource || null
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 404) return null
      throw error
    }
  }

  async getProductsByUser(userId: string): Promise<Product[]> {
    await this.initialize()
    const query = {
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }],
    }
    const { resources } = await this.productsContainer!.items.query<Product>(query).fetchAll()
    return resources
  }

  async getAllProducts(): Promise<Product[]> {
    await this.initialize()
    const query = { query: 'SELECT * FROM c' }
    const { resources } = await this.productsContainer!.items.query<Product>(query).fetchAll()
    return resources
  }

  async createProduct(product: Product): Promise<Product> {
    await this.initialize()
    const { resource } = await this.productsContainer!.items.create(product)
    return resource as Product
  }

  async updateProduct(id: string, userId: string, updates: Partial<Product>): Promise<Product> {
    await this.initialize()
    const existingProduct = await this.getProduct(id, userId)
    if (!existingProduct) throw new Error('Product not found')

    const updatedProduct = {
      ...existingProduct,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const { resource } = await this.productsContainer!.item(id, userId).replace(updatedProduct)
    return resource as Product
  }

  async deleteProduct(id: string, userId: string): Promise<void> {
    await this.initialize()
    await this.productsContainer!.item(id, userId).delete()
  }

  // Alert operations
  async createAlert(alert: PriceAlert): Promise<PriceAlert> {
    await this.initialize()
    const { resource } = await this.alertsContainer!.items.create(alert)
    return resource as PriceAlert
  }

  async getPendingAlerts(): Promise<PriceAlert[]> {
    await this.initialize()
    const query = {
      query: 'SELECT * FROM c WHERE c.notificationSent = false',
    }
    const { resources } = await this.alertsContainer!.items.query<PriceAlert>(query).fetchAll()
    return resources
  }

  async markAlertSent(id: string, userId: string): Promise<void> {
    await this.initialize()
    const { resource } = await this.alertsContainer!.item(id, userId).read<PriceAlert>()
    if (resource) {
      resource.notificationSent = true
      await this.alertsContainer!.item(id, userId).replace(resource)
    }
  }
}

export const databaseService = new DatabaseService()
export default databaseService
