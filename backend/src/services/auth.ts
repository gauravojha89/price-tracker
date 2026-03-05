import { HttpRequest } from '@azure/functions'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

interface DecodedToken {
  sub: string
  oid?: string
  emails?: string[]
  email?: string
  name?: string
  iss: string
  aud: string
  exp: number
  iat: number
}

interface AuthResult {
  isAuthenticated: boolean
  userId?: string
  email?: string
  name?: string
  error?: string
}

// Cache for JWKS client
let jwksClientInstance: jwksClient.JwksClient | null = null

function getJwksClient(): jwksClient.JwksClient {
  if (jwksClientInstance) return jwksClientInstance

  const tenant = process.env.AZURE_AD_B2C_TENANT
  const policy = process.env.AZURE_AD_B2C_POLICY || 'B2C_1_signupsignin'
  
  const jwksUri = `https://${tenant}.b2clogin.com/${tenant}.onmicrosoft.com/${policy}/discovery/v2.0/keys`
  
  jwksClientInstance = jwksClient({
    jwksUri,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  })
  
  return jwksClientInstance
}

async function getSigningKey(kid: string): Promise<string> {
  const client = getJwksClient()
  const key = await client.getSigningKey(kid)
  return key.getPublicKey()
}

export async function validateToken(request: HttpRequest): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { isAuthenticated: false, error: 'Missing or invalid authorization header' }
    }

    const token = authHeader.slice(7)
    
    // Decode header to get key ID
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || !decoded.header.kid) {
      return { isAuthenticated: false, error: 'Invalid token format' }
    }

    // Get signing key
    const signingKey = await getSigningKey(decoded.header.kid)
    
    // Verify token
    const tenant = process.env.AZURE_AD_B2C_TENANT
    const clientId = process.env.AZURE_AD_B2C_CLIENT_ID
    const policy = process.env.AZURE_AD_B2C_POLICY || 'B2C_1_signupsignin'
    
    const issuer = `https://${tenant}.b2clogin.com/${tenant}.onmicrosoft.com/${policy}/v2.0/`
    
    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer,
      audience: clientId,
    }) as DecodedToken

    // Extract user information
    const userId = payload.oid || payload.sub
    const email = payload.emails?.[0] || payload.email
    const name = payload.name

    return {
      isAuthenticated: true,
      userId,
      email,
      name,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token validation failed'
    return { isAuthenticated: false, error: message }
  }
}

export async function requireAuth(request: HttpRequest): Promise<AuthResult> {
  const result = await validateToken(request)
  
  if (!result.isAuthenticated) {
    throw new AuthError(result.error || 'Unauthorized', 401)
  }
  
  return result
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}
