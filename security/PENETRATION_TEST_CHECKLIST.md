# PriceWatch Security Penetration Testing Checklist

## Overview
This document outlines the security testing procedures for the PriceWatch application. All tests should be performed in a staging environment before production deployment.

## Test Categories

### 1. Authentication & Authorization (OWASP A01:2021 - Broken Access Control)

#### Azure AD B2C Authentication
- [x] **Token Validation**: Verify JWT tokens are properly validated
  - Check signature verification using JWKS
  - Verify issuer (iss) claim matches expected B2C tenant
  - Verify audience (aud) claim matches client ID
  - Check token expiration (exp) is enforced
  
- [x] **Session Management**: Verify session handling
  - Tokens stored in sessionStorage (not localStorage)
  - Secure cookie flags enabled
  - Session timeout implemented
  
- [x] **Authorization Checks**: Verify proper access control
  - Users can only access their own products
  - User ID from token used, not from request body
  - Admin endpoints require function key

#### Test Cases
```bash
# Test 1: Access API without token (should fail)
curl -X GET https://[function-app].azurewebsites.net/api/products

# Test 2: Access with invalid token (should fail)
curl -X GET https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer invalid_token"

# Test 3: Access other user's product (should fail)
curl -X GET https://[function-app].azurewebsites.net/api/products/[other-user-product-id] \
  -H "Authorization: Bearer [your-token]"

# Test 4: Modify user ID in request body (should be ignored)
curl -X POST https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer [your-token]" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "url": "https://amazon.com/test", "userId": "other-user-id"}'
```

### 2. Input Validation (OWASP A03:2021 - Injection)

#### SQL/NoSQL Injection
- [x] **Parameterized Queries**: All Cosmos DB queries use parameters
- [x] **Input Sanitization**: User input sanitized before use
- [x] **Schema Validation**: Zod schemas validate all input

#### XSS Prevention
- [x] **HTML Sanitization**: sanitize-html used for user content
- [x] **React Auto-escaping**: React handles XSS by default
- [x] **CSP Headers**: Content-Security-Policy configured

#### Test Cases
```bash
# Test 1: SQL injection in product name
curl -X POST https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test\"; DROP TABLE products;--", "url": "https://amazon.com/test"}'

# Test 2: XSS in product name
curl -X POST https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(1)</script>", "url": "https://amazon.com/test"}'

# Test 3: Invalid URL
curl -X POST https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "url": "javascript:alert(1)"}'
```

### 3. Data Protection (OWASP A02:2021 - Cryptographic Failures)

#### Encryption
- [x] **TLS 1.2+**: All traffic uses HTTPS with TLS 1.2 minimum
- [x] **Data at Rest**: Cosmos DB uses Microsoft-managed encryption
- [x] **No Secrets in Code**: All secrets via Managed Identity or Key Vault

#### Sensitive Data Handling
- [x] **Phone Numbers**: Stored encrypted, validated format
- [x] **Email**: Not exposed in logs or errors
- [x] **PII Minimization**: Only necessary data collected

#### Test Cases
```bash
# Test 1: Attempt HTTP connection (should redirect or fail)
curl -v http://[function-app].azurewebsites.net/api/products

# Test 2: Check TLS version
openssl s_client -connect [function-app].azurewebsites.net:443 -tls1_1
# Should fail (TLS 1.1 not supported)

# Test 3: Check for sensitive data in error messages
curl -X POST https://[function-app].azurewebsites.net/api/products \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"name": ""}'
# Should not expose internal details
```

### 4. API Security (OWASP A04:2021 - Insecure Design)

#### Rate Limiting
- [x] **Product Creation**: Max 50 products per user
- [x] **Price Scraping**: 2-second delay between requests
- [x] **Azure Functions**: Consumption plan has built-in throttling

#### CORS Configuration
- [x] **Allowed Origins**: Only frontend domain allowed
- [x] **Credentials**: Properly configured for auth

#### Test Cases
```bash
# Test 1: Create more than 50 products (should fail on 51st)
for i in {1..51}; do
  curl -X POST https://[function-app].azurewebsites.net/api/products \
    -H "Authorization: Bearer [token]" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"Product $i\", \"url\": \"https://amazon.com/test$i\"}"
done

# Test 2: CORS from unauthorized origin (should fail)
curl -X OPTIONS https://[function-app].azurewebsites.net/api/products \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST"
```

### 5. Infrastructure Security (OWASP A05:2021 - Security Misconfiguration)

#### Azure Configuration
- [x] **Managed Identity**: No connection strings in code
- [x] **RBAC**: Least privilege access for all resources
- [x] **Network**: HTTPS only, FTPS disabled
- [x] **Cosmos DB**: Local auth disabled, AAD only

#### Secrets Management
- [x] **No Hardcoded Secrets**: All via environment/MSI
- [x] **Key Vault**: Available for necessary secrets
- [x] **Federated Identity**: GitHub Actions uses OIDC

#### Test Cases
```bash
# Test 1: Verify FTPS is disabled
curl -v ftp://[function-app].azurewebsites.net
# Should fail

# Test 2: Check for exposed environment variables
curl https://[function-app].azurewebsites.net/api/env
# Should return 404, not env vars

# Test 3: Verify Cosmos DB requires AAD
# Attempt connection with master key (should fail)
```

### 6. Dependency Security (OWASP A06:2021 - Vulnerable Components)

#### NPM Packages
- [x] **Audit**: Run `npm audit` regularly
- [x] **Lock Files**: package-lock.json committed
- [x] **Auto-updates**: Dependabot configured

#### Test Cases
```bash
# Run security audit
cd frontend && npm audit
cd backend && npm audit

# Check for outdated packages
npm outdated

# Run Trivy scan
trivy fs --security-checks vuln .
```

### 7. Logging & Monitoring (OWASP A09:2021 - Security Logging Failures)

#### Application Insights
- [x] **Request Logging**: All API requests logged
- [x] **Error Logging**: Exceptions captured
- [x] **No PII in Logs**: Sensitive data excluded

#### Alerting
- [x] **Failed Auth**: Alert on repeated auth failures
- [x] **Errors**: Alert on error rate spikes
- [x] **Resource**: Alert on unusual resource usage

## Automated Security Scanning

### Running the Security Audit
```bash
cd price-tracker
npx ts-node security/audit.ts
```

### CI/CD Security Scans
- CodeQL: Static analysis for JavaScript/TypeScript
- Trivy: Container and dependency scanning
- npm audit: Dependency vulnerability scanning

## Remediation Priorities

| Priority | Category | Issue | Status |
|----------|----------|-------|--------|
| Critical | Auth | Token validation | ✅ Implemented |
| Critical | Data | HTTPS enforcement | ✅ Implemented |
| High | Input | Schema validation | ✅ Implemented |
| High | Auth | Managed Identity | ✅ Implemented |
| Medium | DoS | Rate limiting | ✅ Implemented |
| Medium | Headers | Security headers | ✅ Implemented |
| Low | Logging | PII exclusion | ✅ Implemented |

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Security Lead | | | |
| Product Owner | | | |

---

## References
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Azure Security Best Practices](https://docs.microsoft.com/azure/security/fundamentals/best-practices-and-patterns)
- [Azure AD B2C Security](https://docs.microsoft.com/azure/active-directory-b2c/security-architecture)
