import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  BrowserAuthError,
} from '@azure/msal-browser'
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react'
import { msalConfig, loginRequest, apiRequest, isB2CConfigured } from './authConfig'
import { setAuthTokenGetter } from '../services/simpleApi'

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig)

// Initialize MSAL before rendering
msalInstance.initialize().catch(console.error)

interface AuthContextType {
  user: AccountInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Inner auth provider that uses MSAL hooks
 */
function AuthProviderInner({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [isLoading, setIsLoading] = useState(true)

  const user = accounts[0] || null

  /**
   * Get access token for API calls
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const currentUser = accounts[0]
    if (!currentUser) return null

    try {
      const response = await instance.acquireTokenSilent({
        ...apiRequest,
        account: currentUser,
      })
      return response.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        try {
          const response = await instance.acquireTokenPopup(apiRequest)
          return response.accessToken
        } catch (popupError) {
          console.error('Token acquisition failed:', popupError)
          return null
        }
      }
      console.error('Token error:', error)
      return null
    }
  }, [instance, accounts])

  useEffect(() => {
    // Wait for MSAL to finish any in-progress operations
    if (inProgress === 'none') {
      setIsLoading(false)
      // Register the token getter with the API service
      setAuthTokenGetter(getAccessToken)
    }
  }, [inProgress, getAccessToken])

  /**
   * Trigger login popup
   */
  const login = async () => {
    try {
      await instance.loginPopup(loginRequest)
    } catch (error) {
      // Handle password reset flow
      if (error instanceof BrowserAuthError) {
        const errorMessage = (error as BrowserAuthError).errorMessage
        if (errorMessage?.includes('AADB2C90118')) {
          // User clicked "Forgot Password" - redirect to password reset flow
          // This would require implementing password reset authority
          console.log('Password reset requested')
        }
      }
      console.error('Login error:', error)
      throw error
    }
  }

  /**
   * Logout and clear session
   */
  const logout = async () => {
    try {
      await instance.logoutPopup({
        postLogoutRedirectUri: window.location.origin,
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    getAccessToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Auth provider wrapper with MSAL
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // If B2C is not configured, provide a mock auth context for development
  if (!isB2CConfigured()) {
    return (
      <MockAuthProvider>
        {children}
      </MockAuthProvider>
    )
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  )
}

/**
 * Mock auth provider for development when B2C is not configured
 */
function MockAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading] = useState(false)

  const mockUser: AccountInfo = {
    homeAccountId: 'demo-user-123',
    localAccountId: 'demo-user-123',
    environment: 'demo',
    tenantId: 'demo',
    username: 'demo@example.com',
    name: 'Demo User',
  }

  const value: AuthContextType = {
    user: isAuthenticated ? mockUser : null,
    isAuthenticated,
    isLoading,
    login: async () => setIsAuthenticated(true),
    logout: async () => setIsAuthenticated(false),
    getAccessToken: async () => 'demo-token',
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
