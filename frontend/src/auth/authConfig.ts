/**
 * Azure AD B2C Authentication Configuration
 * 
 * SECURITY NOTE: These are public client IDs and endpoints - safe to commit.
 * No secrets are stored here. All sensitive operations happen server-side.
 */

// B2C tenant configuration - UPDATE THESE after creating your B2C tenant
const B2C_TENANT_NAME = 'pricetrackerauth' // Your B2C tenant name (without .onmicrosoft.com)
const B2C_CLIENT_ID = '' // Will be populated after app registration

// User flow names - UPDATE THESE after creating user flows
const SIGN_UP_SIGN_IN_POLICY = 'B2C_1_signupsignin'
const PASSWORD_RESET_POLICY = 'B2C_1_passwordreset'

// Construct B2C authority URLs
const B2C_AUTHORITY_DOMAIN = `${B2C_TENANT_NAME}.b2clogin.com`
const B2C_AUTHORITY = `https://${B2C_AUTHORITY_DOMAIN}/${B2C_TENANT_NAME}.onmicrosoft.com/${SIGN_UP_SIGN_IN_POLICY}`
const B2C_PASSWORD_RESET_AUTHORITY = `https://${B2C_AUTHORITY_DOMAIN}/${B2C_TENANT_NAME}.onmicrosoft.com/${PASSWORD_RESET_POLICY}`

// API scopes - the app will request these permissions
const API_SCOPES = [`https://${B2C_TENANT_NAME}.onmicrosoft.com/api/access`]

/**
 * MSAL Configuration
 * @see https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
export const msalConfig = {
  auth: {
    clientId: B2C_CLIENT_ID,
    authority: B2C_AUTHORITY,
    knownAuthorities: [B2C_AUTHORITY_DOMAIN],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // More secure than localStorage
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: number, message: string, containsPii: boolean) => {
        if (containsPii) return // Never log PII
        if (level === 0) console.error(message)
        else if (level === 1) console.warn(message)
        // Suppress info/verbose logs in production
      },
      logLevel: 1, // Warning level
    },
  },
}

/**
 * Scopes to request during login
 */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', ...API_SCOPES],
}

/**
 * Scopes for API calls
 */
export const apiRequest = {
  scopes: API_SCOPES,
}

/**
 * Password reset authority
 */
export const passwordResetAuthority = B2C_PASSWORD_RESET_AUTHORITY

/**
 * Check if B2C is configured
 */
export const isB2CConfigured = (): boolean => {
  return !!(B2C_CLIENT_ID && B2C_TENANT_NAME)
}

export default {
  msalConfig,
  loginRequest,
  apiRequest,
  passwordResetAuthority,
  isB2CConfigured,
}
