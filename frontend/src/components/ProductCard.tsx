import { useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, Trash2, RefreshCw, TrendingDown, TrendingUp, Search } from 'lucide-react'
import type { Product } from '../types'
import CompareModal from './CompareModal'

interface ProductCardProps {
  product: Product
  onDelete: (id: string) => void
  onRefresh: (id: string) => void
  isRefreshing?: boolean
}

export default function ProductCard({
  product,
  onDelete,
  onRefresh,
  isRefreshing,
}: ProductCardProps) {
  const [showCompareModal, setShowCompareModal] = useState(false)
  const currentPrice = product.currentPrice ?? 0
  const originalPrice = product.originalPrice ?? currentPrice
  const priceChange = originalPrice - currentPrice
  const percentageOff = originalPrice > 0 ? ((priceChange / originalPrice) * 100).toFixed(0) : '0'
  const isOnSale = currentPrice < originalPrice && originalPrice > 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: product.currency || 'USD',
    }).format(amount)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-2xl p-6 shadow-soft card-hover border border-gray-100"
    >
      <div className="flex items-start gap-4">
        {/* Product Image */}
        {product.imageUrl ? (
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-gray-400">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{product.store || 'Unknown store'}</p>

          {/* Price Display */}
          <div className="flex items-baseline gap-2 mt-3">
            {currentPrice > 0 ? (
              <>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(currentPrice)}
                </span>
                {isOnSale && (
                  <>
                    <span className="text-sm text-gray-400 line-through">
                      {formatCurrency(originalPrice)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                      <TrendingDown className="w-3 h-3" />
                      {percentageOff}% off
                    </span>
                  </>
                )}
                {currentPrice > originalPrice && originalPrice > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                    <TrendingUp className="w-3 h-3" />
                    Price increased
                  </span>
                )}
              </>
            ) : (
              <span className="text-lg text-gray-500 italic">Price not yet checked</span>
            )}
          </div>

          {/* Last checked */}
          <p className="text-xs text-gray-400 mt-2">
            {product.lastChecked 
              ? `Last checked: ${new Date(product.lastChecked).toLocaleDateString()}`
              : 'Not yet checked'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View
          </a>
        )}
        <button
          onClick={() => setShowCompareModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
        >
          <Search className="w-4 h-4" />
          Compare
        </button>
        <button
          onClick={() => onRefresh(product.id)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={() => onDelete(product.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          Remove
        </button>
      </div>

      {/* Compare Modal */}
      <CompareModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        productName={product.name}
      />
    </motion.div>
  )
}
