import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingDown, User, LayoutDashboard, LogIn, LogOut } from 'lucide-react'
import { useAuth } from '../auth'
import LoginModal from './LoginModal'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { isAuthenticated, user, logout, isLoading } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(false)

  const isActive = (path: string) => location.pathname === path

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25 group-hover:shadow-primary-500/40 transition-shadow">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900">PriceWatch</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <NavLink to="/dashboard" active={isActive('/dashboard')}>
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </NavLink>
                  <NavLink to="/profile" active={isActive('/profile')}>
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </NavLink>
                  <div className="ml-2 pl-2 border-l border-gray-200 flex items-center gap-3">
                    <span className="text-sm text-gray-600 hidden sm:block">
                      {user?.name || user?.email}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="hidden sm:inline">Sign Out</span>
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />

      {/* Main Content */}
      <main className="flex-1">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 py-6">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} PriceWatch. Track prices, save money.
          </p>
        </div>
      </footer>
    </div>
  )
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
        active
          ? 'bg-primary-50 text-primary-700 font-medium'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </Link>
  )
}
