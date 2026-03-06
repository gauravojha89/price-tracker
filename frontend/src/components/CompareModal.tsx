import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Loader2, Store } from 'lucide-react'
import { searchStores, StoreSearchResult } from '../services/simpleApi'

interface CompareModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
}

export default function CompareModal({
  isOpen,
  onClose,
  productName,
}: CompareModalProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<StoreSearchResult[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && productName) {
      fetchStores()
    }
  }, [isOpen, productName])

  const fetchStores = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await searchStores(productName)
      if (response.success && response.data) {
        setResults(response.data.results)
      } else {
        setError(response.error || 'Failed to search stores')
      }
    } catch {
      setError('Failed to search stores')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResults([])
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-h-[80vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-primary-600" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Compare Prices
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Product name */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-600">Searching for:</p>
                <p className="font-medium text-gray-900 truncate">{productName}</p>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-red-600">{error}</p>
                    <button
                      onClick={fetchStores}
                      className="mt-3 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg"
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 mb-3">
                      Click on a store to search for this product and find the best price
                    </p>
                    {results.map((result) => (
                      <a
                        key={result.store}
                        href={result.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                      >
                        <span className="text-2xl">{result.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 group-hover:text-primary-600">
                            {result.store}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            Search for "{productName.substring(0, 30)}{productName.length > 30 ? '...' : ''}"
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-primary-600" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center">
                  Find the product page and add it to track prices on that store too
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
