import { useState, useEffect, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { User, Mail, Bell, Save, Loader2, CheckCircle, Send } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/simpleApi'
import type { User as UserType, UpdateUserRequest } from '../types'

export default function ProfilePage() {
  const [_user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testSent, setTestSent] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    setLoading(true)
    const result = await api.getProfile()
    if (result.success && result.data) {
      setUser(result.data)
      setName(result.data.name || '')
      setEmail(result.data.email || '')
      setEmailNotifications(result.data.emailNotifications !== false)
    }
    setLoading(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    setSaved(false)

    // Email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      setSaving(false)
      return
    }

    const data: UpdateUserRequest = {
      name: name.trim(),
      email: email.trim(),
      emailNotifications,
    }

    const result = await api.updateProfile(data)
    if (result.success && result.data) {
      setUser(result.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      setError(result.error || 'Failed to update profile')
    }
    setSaving(false)
  }

  const handleTestNotification = async () => {
    if (!email) {
      setError('Please enter an email address first')
      return
    }
    setTestingEmail(true)
    setError(null)
    const result = await api.testNotification(email)
    if (result.success) {
      setTestSent(true)
      setTimeout(() => setTestSent(false), 5000)
    } else {
      setError(result.error || 'Failed to send test notification')
    }
    setTestingEmail(false)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-600 mt-1">
          Manage your account and notification preferences
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-8 shadow-soft border border-gray-100"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          {/* Email (editable - for notifications) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Notification Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                Price alerts will be sent to this email
              </p>
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testingEmail || !email}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 flex items-center gap-1"
              >
                {testingEmail ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : testSent ? (
                  <>
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    <span className="text-green-600">Sent! Check inbox</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    Send test email
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Email Notifications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Email Notifications
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${
                  emailNotifications ? 'bg-primary-600' : 'bg-gray-300'
                }`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    emailNotifications ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
              <span className="text-sm text-gray-700">
                {emailNotifications ? 'Enabled' : 'Disabled'} - Get notified when prices drop
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* Security Info */}
      <div className="mt-8 p-6 bg-gray-50 rounded-2xl">
        <h3 className="font-medium text-gray-900 mb-2">Security Information</h3>
        <p className="text-sm text-gray-600">
          Your account is secured with Microsoft Azure Active Directory B2C.
          All data is encrypted in transit and at rest. We never store your
          password or share your personal information with third parties.
        </p>
      </div>
    </div>
  )
}
