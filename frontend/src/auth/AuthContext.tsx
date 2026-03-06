import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getAuthInfo, login as swaLogin, logout as swaLogout, ClientPrincipal } from './swaAuth'
import { setAuthTokenGetter } from '../services/simpleApi'

interface User {
  id: string
  email: string
  name: string
  provider: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (provider?: 'aad' | 'github' | 'twitter') => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Convert SWA ClientPrincipal to User object
 */
function clientPrincipalToUser(principal: ClientPrincipal): User {
  return {
    id: principal.userId,
    email: principal.userDetails,
    name: principal.claims?.find(c => c.typ === 'name')?.val || principal.userDetails,
    provider: principal.identityProvider,
  }
}

/**
 * Auth provider using Azure Static Web Apps built-in authentication
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check auth status on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const authInfo = await getAuthInfo()
      if (authInfo.clientPrincipal) {
        setUser(clientPrincipalToUser(authInfo.clientPrincipal))
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // SWA auth doesn't use bearer tokens - the cookie is sent automatically
  // But APIs can read user from x-ms-client-principal header
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // SWA handles auth via cookies, no token needed
    // Return a placeholder so API knows user is authenticated
    return user ? 'swa-auth' : null
  }, [user])

  // Register token getter with API service
  useEffect(() => {
    setAuthTokenGetter(getAccessToken)
  }, [getAccessToken])

  const login = (provider: 'aad' | 'github' | 'twitter' = 'aad') => {
    swaLogin(provider)
  }

  const logout = () => {
    swaLogout()
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthProvider

export default AuthProvider
