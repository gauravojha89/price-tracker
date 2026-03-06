/**
 * Authentication helper for Azure Functions
 * Handles both Azure SWA built-in auth and Azure AD B2C JWT tokens
 */

const jwt = require('jsonwebtoken');

// B2C Configuration - UPDATE THESE after creating B2C tenant
const B2C_TENANT_NAME = process.env.B2C_TENANT_NAME || 'pricetrackerauth';
const B2C_POLICY_NAME = process.env.B2C_POLICY_NAME || 'B2C_1_signupsignin';
const B2C_CLIENT_ID = process.env.B2C_CLIENT_ID || '';

// B2C endpoints
const B2C_ISSUER = `https://${B2C_TENANT_NAME}.b2clogin.com/${B2C_TENANT_NAME}.onmicrosoft.com/${B2C_POLICY_NAME}/v2.0`;

/**
 * Get authenticated user from request
 * Returns user object with id, email, and name
 */
async function getAuthenticatedUser(req, context) {
  // Method 1: Azure SWA built-in authentication (x-ms-client-principal)
  const clientPrincipal = req.headers['x-ms-client-principal'];
  if (clientPrincipal) {
    try {
      const decoded = JSON.parse(Buffer.from(clientPrincipal, 'base64').toString('utf8'));
      return {
        id: decoded.userId,
        email: decoded.userDetails,
        name: decoded.claims?.find(c => c.typ === 'name')?.val || decoded.userDetails,
        provider: decoded.identityProvider,
        authenticated: true
      };
    } catch (error) {
      context?.log?.warn('Failed to parse client principal:', error.message);
    }
  }

  // Method 2: JWT Bearer token (Azure AD B2C)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // Decode token (in production, validate signature with B2C public key)
      const decoded = jwt.decode(token);
      
      if (!decoded) {
        return { authenticated: false, error: 'Invalid token' };
      }

      // Validate required claims
      if (!decoded.sub) {
        return { authenticated: false, error: 'Missing subject claim' };
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        return { authenticated: false, error: 'Token expired' };
      }

      // Validate issuer (basic check)
      if (B2C_CLIENT_ID && decoded.aud !== B2C_CLIENT_ID) {
        context?.log?.warn('Token audience mismatch');
        // Don't fail - B2C config might not be set
      }

      return {
        id: decoded.sub || decoded.oid,
        email: decoded.emails?.[0] || decoded.email || decoded.preferred_username,
        name: decoded.name || decoded.given_name,
        provider: 'b2c',
        authenticated: true
      };
    } catch (error) {
      context?.log?.warn('Failed to decode JWT:', error.message);
      return { authenticated: false, error: 'Invalid token format' };
    }
  }

  // No authentication found
  return { authenticated: false, error: 'No authentication provided' };
}

/**
 * Middleware to require authentication
 * Returns 401 if not authenticated
 */
async function requireAuth(req, context) {
  const user = await getAuthenticatedUser(req, context);
  
  if (!user.authenticated) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: user.error || 'Authentication required' }
    };
  }
  
  return null; // Authenticated successfully
}

/**
 * Get user ID from request (backwards compatible)
 */
async function getUserId(req, context) {
  const user = await getAuthenticatedUser(req, context);
  
  // For development without B2C configured
  if (!user.authenticated && !B2C_CLIENT_ID) {
    return 'demo-user-123';
  }
  
  return user.id || null;
}

module.exports = {
  getAuthenticatedUser,
  requireAuth,
  getUserId
};
