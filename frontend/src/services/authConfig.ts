import { Configuration, LogLevel } from '@azure/msal-browser'

// Azure AD B2C configuration
// These values should be replaced with actual values from Azure Portal
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const tenantName = import.meta.env.VITE_AZURE_TENANT_NAME || ''
const signUpSignInPolicy = import.meta.env.VITE_AZURE_SUSI_POLICY || 'B2C_1_signupsignin'

const b2cPolicies = {
  names: {
    signUpSignIn: signUpSignInPolicy,
  },
  authorities: {
    signUpSignIn: {
      authority: `https://${tenantName}.b2clogin.com/${tenantName}.onmicrosoft.com/${signUpSignInPolicy}`,
    },
  },
  authorityDomain: `${tenantName}.b2clogin.com`,
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId,
    authority: b2cPolicies.authorities.signUpSignIn.authority,
    knownAuthorities: [b2cPolicies.authorityDomain],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // More secure than localStorage
    storeAuthStateInCookie: false,
    secureCookies: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        switch (level) {
          case LogLevel.Error:
            console.error(message)
            break
          case LogLevel.Warning:
            console.warn(message)
            break
        }
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
    allowNativeBroker: false,
  },
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
}

export const apiConfig = {
  scopes: [`https://${tenantName}.onmicrosoft.com/price-tracker-api/access_as_user`],
  uri: import.meta.env.VITE_API_BASE_URL || '/api',
}
