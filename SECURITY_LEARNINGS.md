# PriceWatch Project: Security Learnings & Red Team Analysis

## Executive Summary

This document captures security concepts learned during the development of the PriceWatch price tracking application on Azure, along with a comprehensive red team analysis including attack paths, techniques, and mitigations.

---

## Part 1: Key Azure Security Concepts Learned

### 1.1 Identity & Access Management

#### Managed Identity (MI)
**What it is:** Azure-managed credentials that eliminate the need for secrets in code.

**Implementation in this project:**
- Azure Functions use `DefaultAzureCredential` to access Cosmos DB
- No connection strings or keys stored in application code
- Azure handles credential rotation automatically

```javascript
// How we implemented it
const { DefaultAzureCredential } = require('@azure/identity');
const credential = new DefaultAzureCredential();
const client = new CosmosClient({ endpoint, aadCredentials: credential });
```

**Key Learning:** Managed Identities are the gold standard for service-to-service authentication in Azure. They completely eliminate the credential management burden.

#### Federated Identity Credentials (FIC)
**What it is:** Allows external identity providers (like GitHub) to authenticate to Azure without storing secrets.

**Implementation in this project:**
- GitHub Actions authenticates to Azure using OIDC tokens
- No Azure service principal secrets stored in GitHub
- Trust relationship defined in Bicep:

```bicep
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-actions'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}
```

**Key Learning:** FIC enables "keyless" CI/CD pipelines. The trust is between identity providers, not shared secrets.

#### Azure Static Web Apps Built-in Authentication
**What it is:** Zero-configuration authentication provided by Azure SWA.

**Implementation:**
- Microsoft identity provider via `/.auth/login/aad`
- User info passed to APIs via `x-ms-client-principal` header
- Route-level protection in `staticwebapp.config.json`

**Key Learning:** SWA's built-in auth is simpler than Azure AD B2C for basic authentication needs. No additional Azure resources required.

### 1.2 Data Protection

#### Cosmos DB Security
- **Encryption at rest:** Automatic with Microsoft-managed keys
- **Encryption in transit:** TLS 1.2 enforced
- **Data isolation:** Partition key (`userId`) ensures data segregation
- **Firewall rules:** Can restrict to specific VNets/IPs

#### Secure Headers
Implemented via `staticwebapp.config.json`:
- `Content-Security-Policy`: Prevents XSS and injection attacks
- `X-Frame-Options: DENY`: Prevents clickjacking
- `X-Content-Type-Options: nosniff`: Prevents MIME sniffing

### 1.3 Zero Trust Principles Applied

| Principle | Implementation |
|-----------|---------------|
| Verify explicitly | All API requests validated via `x-ms-client-principal` |
| Least privilege | User-assigned MI with minimal RBAC roles |
| Assume breach | User data partitioned by `userId`, no cross-user access |

---

## Part 2: Red Team Attack Path Analysis

### Attack Surface Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ATTACK SURFACE MAP                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌───────────────┐│
│  │ Internet │───▶│ Azure SWA     │───▶│ Azure        │───▶│ Cosmos DB     ││
│  │ Users    │    │ (Frontend)    │    │ Functions    │    │ (Data)        ││
│  └──────────┘    └───────────────┘    └──────────────┘    └───────────────┘│
│       │                │                     │                    │         │
│       │                │                     │                    │         │
│       ▼                ▼                     ▼                    ▼         │
│  [A1: Auth     [A2: Client-Side    [A3: API          [A4: Data             │
│   Bypass]       Attacks]            Vulnerabilities]   Exfiltration]       │
│                                                                              │
│  ┌──────────┐    ┌───────────────┐                                          │
│  │ GitHub   │───▶│ Azure IAM     │                                          │
│  │ Actions  │    │ (RBAC/MI)     │                                          │
│  └──────────┘    └───────────────┘                                          │
│       │                │                                                     │
│       ▼                ▼                                                     │
│  [A5: CI/CD     [A6: Privilege                                              │
│   Compromise]    Escalation]                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Attack Path 1: Managed Identity Token Theft

#### Scenario
An attacker gains code execution on an Azure Function and attempts to steal the Managed Identity token for lateral movement.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: MI TOKEN THEFT                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Initial Access                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Exploit vulnerability in Azure Function     │                            │
│  │ Examples:                                   │                            │
│  │ - Prototype pollution in Node.js            │                            │
│  │ - Deserialization vulnerability             │                            │
│  │ - Command injection via user input          │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 2: Token Acquisition                                                   │
│  ┌─────────────────────────────────────────────┐                            │
│  │ curl "http://169.254.169.254/metadata/     │                            │
│  │       identity/oauth2/token?api-version=   │                            │
│  │       2019-08-01&resource=https://         │                            │
│  │       management.azure.com/"               │                            │
│  │       -H "Metadata: true"                  │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 3: Lateral Movement                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Use stolen token to:                        │                            │
│  │ - Access Cosmos DB directly                 │                            │
│  │ - Enumerate other Azure resources           │                            │
│  │ - Access Key Vault (if permitted)           │                            │
│  │ - Modify Azure resources                    │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1552.005 - Unsecured Credentials: Cloud Instance Metadata API

#### Evidence of Attack
- Unusual IMDS (169.254.169.254) access patterns
- Token requests for unexpected resources
- API calls from unexpected source IPs

#### Mitigations

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| Least privilege RBAC | MI only has Cosmos DB Data Contributor | ✅ Implemented |
| Network isolation | Restrict IMDS access with NSG | ⚠️ Recommended |
| Token lifetime | Use short-lived tokens (1 hr default) | ✅ Default |
| Monitoring | Enable Defender for Cloud | ⚠️ Recommended |
| Input validation | Sanitize all user inputs | ✅ Implemented |

---

### Attack Path 2: Federated Identity Credential Abuse

#### Scenario
An attacker compromises the GitHub repository or Actions workflow to abuse the federated identity trust.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: FIC ABUSE                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: GitHub Compromise                                                   │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Attack vectors:                             │                            │
│  │ - Compromised maintainer account            │                            │
│  │ - Malicious PR with workflow modification   │                            │
│  │ - Dependency confusion attack               │                            │
│  │ - GitHub token exposure                     │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 2: Workflow Injection                                                  │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Modify .github/workflows/*.yml to:          │                            │
│  │ - Exfiltrate OIDC tokens                    │                            │
│  │ - Add malicious deployment steps            │                            │
│  │ - Inject backdoors into application         │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 3: Azure Token Exchange                                                │
│  ┌─────────────────────────────────────────────┐                            │
│  │ GitHub OIDC token exchanged for Azure       │                            │
│  │ access token via FIC trust relationship     │                            │
│  │                                             │                            │
│  │ az login --federated-token $ACTIONS_TOKEN   │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 4: Azure Resource Access                                               │
│  ┌─────────────────────────────────────────────┐                            │
│  │ With Contributor role:                      │                            │
│  │ - Deploy malicious code to SWA              │                            │
│  │ - Access/modify Cosmos DB                   │                            │
│  │ - Create backdoor accounts                  │                            │
│  │ - Exfiltrate data                           │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1199 - Trusted Relationship

#### Evidence of Attack
- Unexpected workflow runs on main branch
- Modified workflow files without PR review
- Unusual Azure deployments from Actions

#### Mitigations

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| Branch protection | Require PR reviews for main | ⚠️ Recommended |
| CODEOWNERS | Require security team review for workflows | ⚠️ Recommended |
| Restrict FIC subject | Only allow `ref:refs/heads/main` | ✅ Implemented |
| Environment protection | Require approval for production deploys | ⚠️ Recommended |
| Workflow permissions | Use minimum required permissions | ⚠️ Recommended |
| Audit logging | Enable GitHub audit logs | ⚠️ Recommended |

---

### Attack Path 3: Authentication Bypass via Header Manipulation

#### Scenario
An attacker attempts to forge the `x-ms-client-principal` header to impersonate another user.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: AUTH HEADER FORGERY                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Reconnaissance                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Discover that API uses x-ms-client-principal│                            │
│  │ header for authentication                   │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 2: Header Crafting                                                     │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Create fake base64-encoded principal:       │                            │
│  │ {                                           │                            │
│  │   "userId": "target-user-id",               │                            │
│  │   "userDetails": "victim@email.com",        │                            │
│  │   "identityProvider": "aad"                 │                            │
│  │ }                                           │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 3: Direct API Call (BLOCKED)                                           │
│  ┌─────────────────────────────────────────────┐                            │
│  │ curl -X GET "https://app.azurestaticapps.   │                            │
│  │      net/api/products"                      │                            │
│  │      -H "x-ms-client-principal: <forged>"   │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 4: Result                                                              │
│  ┌─────────────────────────────────────────────┐                            │
│  │ ❌ ATTACK FAILS                              │                            │
│  │                                             │                            │
│  │ Azure SWA proxy strips and re-injects       │                            │
│  │ x-ms-client-principal header. Client-       │                            │
│  │ provided headers are NOT trusted.           │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1134 - Access Token Manipulation

#### Why This Attack Fails
Azure Static Web Apps **always** strips the `x-ms-client-principal` header from incoming requests and only injects it after validating the user's session cookie. This is a platform-level security control.

#### Mitigations (Defense in Depth)

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| Platform header injection | SWA strips client headers | ✅ Platform default |
| Header validation in code | Check header integrity | ✅ Implemented |
| User ID isolation | All queries filter by userId | ✅ Implemented |
| Session validation | Cookie-based auth | ✅ Platform default |

---

### Attack Path 4: IDOR (Insecure Direct Object Reference)

#### Scenario
An authenticated attacker attempts to access another user's products by guessing or enumerating product IDs.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: IDOR PRODUCT ACCESS                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Legitimate Access                                                   │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Attacker authenticates and gets their own   │                            │
│  │ product IDs from /api/products              │                            │
│  │                                             │                            │
│  │ Response: [{ id: "prod_123_abc", ... }]     │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 2: ID Enumeration                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Try to access other product IDs:            │                            │
│  │                                             │                            │
│  │ GET /api/products/prod_122_abc              │                            │
│  │ GET /api/products/prod_124_abc              │                            │
│  │ DELETE /api/products/prod_other_user        │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 3: Result (BLOCKED)                                                    │
│  ┌─────────────────────────────────────────────┐                            │
│  │ ❌ ATTACK FAILS                              │                            │
│  │                                             │                            │
│  │ All database queries include userId filter: │                            │
│  │ WHERE c.userId = @authenticatedUserId       │                            │
│  │                                             │                            │
│  │ Response: 404 Not Found                     │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1530 - Data from Cloud Storage Object

#### Why This Attack Fails
```javascript
// All queries enforce user isolation
const { resources } = await container.items.query({
  query: 'SELECT * FROM c WHERE c.id = @id AND c.userId = @userId',
  parameters: [
    { name: '@id', value: productId },
    { name: '@userId', value: authenticatedUserId } // Always from auth header
  ]
}).fetchAll();
```

#### Mitigations

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| Query-level user filtering | All queries include userId | ✅ Implemented |
| Partition key design | Products partitioned by userId | ✅ Implemented |
| UUIDs for product IDs | Non-guessable identifiers | ✅ Implemented |
| Authorization checks | Verify ownership before actions | ✅ Implemented |

---

### Attack Path 5: Secrets Exfiltration via CI/CD

#### Scenario
An attacker attempts to extract secrets from the CI/CD pipeline or deployed application.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: SECRET EXFILTRATION                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Vector 1: Environment Variable Dump                                         │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Inject code to dump env vars:               │                            │
│  │ console.log(JSON.stringify(process.env))    │                            │
│  │                                             │                            │
│  │ Result: Finds COSMOS_ENDPOINT, COSMOS_KEY   │                            │
│  │ ⚠️ PARTIAL SUCCESS - Keys are still exposed │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
│  Vector 2: Code Repository Scan                                              │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Search repo for hardcoded secrets:          │                            │
│  │ grep -r "password\|secret\|key" .           │                            │
│  │                                             │                            │
│  │ Result: ❌ No secrets in code               │                            │
│  │ MI/FIC eliminates hardcoded credentials     │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
│  Vector 3: GitHub Actions Logs                                               │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Check workflow run logs for leaked secrets  │                            │
│  │                                             │                            │
│  │ Result: ❌ GitHub auto-masks secrets        │                            │
│  │ OIDC tokens never logged                    │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1552.001 - Credentials in Files

#### Current Vulnerability
While code has no hardcoded secrets, the SWA app settings still contain `COSMOS_KEY`. This is a configuration weakness.

#### Mitigations

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| Managed Identity for Cosmos | Eliminate connection string | ⚠️ Recommended |
| Key Vault references | Store secrets in Key Vault | ⚠️ Recommended |
| Secret rotation | Auto-rotate keys regularly | ⚠️ Recommended |
| Env var audit | Monitor access to sensitive vars | ⚠️ Recommended |

---

### Attack Path 6: Supply Chain Attack via npm

#### Scenario
An attacker compromises an npm dependency used by the application.

#### Attack Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ATTACK PATH: SUPPLY CHAIN COMPROMISE                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Dependency Identification                                           │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Identify high-value targets in package.json │                            │
│  │ - @azure/cosmos                             │                            │
│  │ - @azure/identity                           │                            │
│  │ - jsonwebtoken                              │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 2: Attack Vectors                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │ - Typosquatting: @azur/cosmos               │                            │
│  │ - Maintainer compromise                     │                            │
│  │ - Dependency confusion                      │                            │
│  │ - Malicious post-install scripts            │                            │
│  └─────────────────────────────────────────────┘                            │
│                           │                                                  │
│                           ▼                                                  │
│  Step 3: Code Injection                                                      │
│  ┌─────────────────────────────────────────────┐                            │
│  │ Malicious package exfiltrates:              │                            │
│  │ - Environment variables (MI tokens)         │                            │
│  │ - Request headers (user data)               │                            │
│  │ - Database contents                         │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Attack Technique
**MITRE ATT&CK:** T1195.001 - Compromise Software Dependencies

#### Mitigations

| Mitigation | Implementation | Status |
|------------|----------------|--------|
| npm audit in CI | Check vulnerabilities on every build | ⚠️ Recommended |
| Package lockfiles | Use package-lock.json | ✅ Implemented |
| Dependabot | Auto-update vulnerable packages | ⚠️ Recommended |
| SBOM generation | Software Bill of Materials | ⚠️ Recommended |
| Private npm registry | Use Azure Artifacts | ⚠️ Recommended |

---

## Part 3: Summary Tables

### Attack Techniques Summary

| Attack Path | MITRE ATT&CK ID | Technique Name | Severity | Status |
|-------------|-----------------|----------------|----------|--------|
| MI Token Theft | T1552.005 | Cloud Instance Metadata API | High | Mitigated |
| FIC Abuse | T1199 | Trusted Relationship | Critical | Partially Mitigated |
| Header Forgery | T1134 | Access Token Manipulation | High | Mitigated (Platform) |
| IDOR | T1530 | Data from Cloud Storage | Medium | Mitigated |
| Secret Exfiltration | T1552.001 | Credentials in Files | High | Partially Mitigated |
| Supply Chain | T1195.001 | Compromise Software Dependencies | High | Partially Mitigated |

### Recommended Security Improvements

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| P0 | Enable Managed Identity for Cosmos DB (remove key) | Medium | High |
| P0 | Add branch protection rules to GitHub repo | Low | High |
| P1 | Enable Microsoft Defender for Cloud | Low | Medium |
| P1 | Implement CODEOWNERS for workflow protection | Low | Medium |
| P1 | Add npm audit to CI/CD pipeline | Low | Medium |
| P2 | Enable GitHub audit logging | Low | Low |
| P2 | Implement Key Vault for remaining secrets | Medium | Medium |
| P2 | Add SBOM generation to build | Low | Low |

---

## Part 4: Key Takeaways for Manager

### What I Learned

1. **Managed Identity is non-negotiable** - Eliminates entire classes of credential theft attacks
2. **Federated Identity Credentials enable "keyless" CI/CD** - No secrets in GitHub, but requires workflow protection
3. **Defense in depth still matters** - Even with MI, implement user isolation, input validation, monitoring
4. **Platform security controls are powerful** - SWA header stripping prevents auth bypass attempts
5. **Supply chain is the weakest link** - Modern apps have hundreds of dependencies, each a potential attack vector

### Cost-Benefit of Security Measures

| Security Control | Implementation Cost | Risk Reduction |
|-----------------|---------------------|----------------|
| Managed Identity | ~2 hours | Eliminates credential theft |
| Federated Identity Credentials | ~4 hours | Eliminates CI/CD secrets |
| SWA Built-in Auth | ~1 hour | Enterprise-grade auth |
| User data isolation | ~1 hour | Prevents IDOR attacks |
| Security headers | ~30 minutes | Prevents XSS/clickjacking |

### Red Team Exercise Value

This analysis demonstrates that:
1. **Most attack paths are already mitigated** by Azure platform controls
2. **The remaining risks** are primarily in CI/CD and supply chain
3. **Keyless authentication** (MI + FIC) dramatically reduces attack surface
4. **Continuous security testing** should focus on dependency vulnerabilities and workflow integrity

---

*Document generated: March 6, 2026*
*Project: PriceWatch Price Tracking Application*
*Security Classification: Internal*
