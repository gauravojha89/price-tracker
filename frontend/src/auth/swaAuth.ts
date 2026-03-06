/**
 * Azure Static Web Apps Built-in Authentication
 * 
 * SWA provides built-in auth with Microsoft, GitHub, Twitter providers.
 * No additional Azure resources or configuration needed.
 * 
 * @see https://docs.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
 */

export interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
  claims?: Array<{ typ: string; val: string }>
}

export interface AuthInfo {
  clientPrincipal: ClientPrincipal | null
}

/**
 * Get current user info from SWA auth endpoint
 */
export async function getAuthInfo(): Promise<AuthInfo> {
  try {
    const response = await fetch('/.auth/me')
    if (!response.ok) {
      return { clientPrincipal: null }
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Failed to get auth info:', error)
    return { clientPrincipal: null }
  }
}

/**
 * Login with specified provider
 * @param provider - The identity provider to use
 * @param redirectTo - Optional URL to redirect to after login (defaults to current page)
 */
export function login(provider: 'aad' | 'github' | 'twitter' = 'aad', redirectTo?: string) {
  const redirect = redirectTo || window.location.pathname
  window.location.href = `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(redirect)}`
}

/**
 * Logout and redirect to home
 */
export function logout() {
  window.location.href = '/.auth/logout?post_logout_redirect_uri=/'
}

/**
 * Provider display names
 */
export const providerNames: Record<string, string> = {
  aad: 'Microsoft',
  github: 'GitHub',
  twitter: 'Twitter',
}

export default {
  getAuthInfo,
  login,
  logout,
  providerNames,
}
