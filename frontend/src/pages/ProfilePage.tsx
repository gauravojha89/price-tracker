import { useState, useEffect, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { User, Mail, Phone, Bell, Save, Loader2, CheckCircle } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/simpleApi'
import type { User as UserType, UpdateUserRequest } from '../types'

export default function ProfilePage() {
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [notificationPreference, setNotificationPreference] = useState<'email' | 'sms' | 'both'>('email')

  // Get email from user profile
  const email = user?.email || 'demo@example.com'

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    setLoading(true)
    const result = await api.getProfile()
    if (result.success && result.data) {
      setUser(result.data)
      setName(result.data.name || '')
      setPhoneNumber(result.data.phoneNumber || '')
      setNotificationPreference(result.data.notificationPreference || 'email')
    }
    setLoading(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    setSaved(false)

    // Phone number validation
    if (phoneNumber && !/^\+?[1-9]\d{9,14}$/.test(phoneNumber.replace(/[\s-]/g, ''))) {
      setError('Please enter a valid phone number')
      setSaving(false)
      return
    }

    const data: UpdateUserRequest = {
      name: name.trim(),
      phoneNumber: phoneNumber.trim() || undefined,
      notificationPreference,
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

          {/* Email (read-only) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                disabled
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Email is managed through your Microsoft account
            </p>
          </div>

          {/* Phone Number */}
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Phone Number{' '}
              <span className="text-gray-400 font-normal">(for SMS alerts)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          {/* Notification Preference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notification Preference
              </span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <NotificationOption
                value="email"
                label="Email Only"
                selected={notificationPreference === 'email'}
                onChange={() => setNotificationPreference('email')}
              />
              <NotificationOption
                value="sms"
                label="SMS Only"
                selected={notificationPreference === 'sms'}
                onChange={() => setNotificationPreference('sms')}
                disabled={!phoneNumber}
              />
              <NotificationOption
                value="both"
                label="Both"
                selected={notificationPreference === 'both'}
                onChange={() => setNotificationPreference('both')}
                disabled={!phoneNumber}
              />
            </div>
            {!phoneNumber && (
              <p className="mt-2 text-xs text-gray-500">
                Add a phone number to enable SMS notifications
              </p>
            )}
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

function NotificationOption({
  value: _value,
  label,
  selected,
  onChange,
  disabled,
}: {
  value: string
  label: string
  selected: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
        selected
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : disabled
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  )
}
