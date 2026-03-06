import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingDown, Bell, Shield, Zap, ArrowRight, ArrowDown } from 'lucide-react'
import { useAuth } from '../auth'

export default function HomePage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()

  const handleCTA = () => {
    if (isAuthenticated) {
      navigate('/dashboard')
    } else {
      // Scroll to features section
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-[calc(100vh-140px)]">
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-8">
              <Zap className="w-4 h-4" />
              Never miss a deal again
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6"
          >
            Track prices.
            <br />
            <span className="text-primary-600">Save money.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-600 mb-10 leading-relaxed"
          >
            Add any product from your favorite stores and we'll notify you
            instantly when the price drops. Simple, automatic, and free.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <button
              onClick={handleCTA}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white text-lg font-medium rounded-2xl hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/20 hover:shadow-gray-900/30 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Learn More'}
              {isAuthenticated ? <ArrowRight className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
            </button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-24 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Why PriceWatch?
            </h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              We monitor prices from top retailers so you don't have to.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<TrendingDown className="w-6 h-6" />}
              title="Smart Price Tracking"
              description="Our system checks prices daily across Amazon, Best Buy, Target, Walmart, and more trusted retailers."
              delay={0}
            />
            <FeatureCard
              icon={<Bell className="w-6 h-6" />}
              title="Instant Notifications"
              description="Get notified via email the moment a product you're tracking goes on sale or drops in price."
              delay={0.1}
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Secure & Private"
              description="Your data is protected with enterprise-grade security. We never share or sell your information."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Stores Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm text-gray-500 mb-8">
            Tracking prices from trusted retailers
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60">
            <span className="text-2xl font-bold text-gray-400">Amazon</span>
            <span className="text-2xl font-bold text-gray-400">Best Buy</span>
            <span className="text-2xl font-bold text-gray-400">Target</span>
            <span className="text-2xl font-bold text-gray-400">Walmart</span>
            <span className="text-2xl font-bold text-gray-400">Costco</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="bg-gray-50 rounded-2xl p-8 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </motion.div>
  )
}
