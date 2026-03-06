import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { login } from '../auth'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  redirectTo?: string
}

export default function LoginModal({ isOpen, onClose, redirectTo }: LoginModalProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleProviderLogin = (provider: 'aad' | 'apple' | 'github') => {
    setLoading(provider)
    login(provider, redirectTo || '/dashboard')
  }

  const providers = [
    {
      id: 'aad' as const,
      name: 'Microsoft',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
        </svg>
      ),
      bgColor: 'bg-white hover:bg-gray-50',
      textColor: 'text-gray-900',
      border: 'border border-gray-300',
    },
    {
      id: 'github' as const,
      name: 'GitHub',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      bgColor: 'bg-gray-900 hover:bg-gray-800',
      textColor: 'text-white',
      border: '',
    },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-8 mx-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Sign in</h2>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Provider Buttons */}
              <div className="space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderLogin(provider.id)}
                    disabled={loading !== null}
                    className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${provider.bgColor} ${provider.textColor} ${provider.border} ${loading === provider.id ? 'opacity-70' : ''} disabled:cursor-not-allowed`}
                  >
                    {loading === provider.id ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      provider.icon
                    )}
                    <span>Continue with {provider.name}</span>
                  </button>
                ))}
              </div>

              {/* Terms */}
              <p className="mt-6 text-xs text-center text-gray-500">
                By signing in, you agree to our{' '}
                <a href="#" className="text-primary-600 hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-primary-600 hover:underline">
                  Privacy Policy
                </a>
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
