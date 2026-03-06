import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Package, Search, RefreshCw } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import AddProductModal from '../components/AddProductModal'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/simpleApi'
import type { Product } from '../types'

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await api.getProducts()
    if (result.success && result.data) {
      setProducts(result.data)
    } else {
      setError(result.error || 'Failed to load products')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Add product handler
  const handleAddProduct = async (data: { name: string; url?: string; targetPrice?: number }) => {
    const result = await api.createProduct(data)
    if (result.success && result.data) {
      setProducts((prev) => [result.data!, ...prev])
    } else {
      throw new Error(result.error || 'Failed to add product')
    }
  }

  // Delete product handler
  const handleDelete = async (id: string) => {
    const result = await api.deleteProduct(id)
    if (result.success) {
      setProducts((prev) => prev.filter((p) => p.id !== id))
    }
  }

  // Refresh price handler
  const handleRefresh = async (id: string) => {
    setRefreshingIds((prev) => new Set(prev).add(id))
    const result = await api.refreshPrice(id)
    if (result.success) {
      // Refetch all products to get updated data
      await fetchProducts()
    }
    setRefreshingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Check all prices handler
  const handleCheckAllPrices = async () => {
    setLoading(true)
    const result = await api.checkAllPrices()
    if (result.success) {
      await fetchProducts()
    }
    setLoading(false)
  }

  // Filter products by search
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.store && p.store.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Stats
  const onSaleCount = products.filter((p) => p.isOnSale).length

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Products</h1>
          <p className="text-gray-600 mt-1">
            {products.length} products tracked
            {onSaleCount > 0 && (
              <span className="text-green-600 font-medium">
                {' '}· {onSaleCount} on sale
              </span>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          {products.length > 0 && (
            <button
              onClick={handleCheckAllPrices}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Check All
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/20"
          >
            <Plus className="w-5 h-5" />
            Track Product
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 text-red-700 px-4 py-3 rounded-xl mb-6"
        >
          {error}
        </motion.div>
      )}

      {/* Search (only show if there are products) */}
      {products.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full max-w-md pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          />
        </div>
      )}

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
                isRefreshing={refreshingIds.has(product.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : products.length > 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">No products match your search.</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No products yet
          </h2>
          <p className="text-gray-600 mb-6 max-w-sm mx-auto">
            Start tracking products to get notified when prices drop.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Track Your First Product
          </button>
        </motion.div>
      )}

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddProduct}
      />
    </div>
  )
}
