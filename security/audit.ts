#!/usr/bin/env node
/**
 * PriceWatch Security Audit Script
 * Performs automated security checks on the application
 * 
 * Run: npx ts-node security/audit.ts
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface SecurityCheck {
  name: string
  category: string
  status: 'pass' | 'fail' | 'warning' | 'info'
  details: string
  recommendation?: string
}

const results: SecurityCheck[] = []

function log(message: string): void {
  console.log(`[AUDIT] ${message}`)
}

function addResult(check: SecurityCheck): void {
  results.push(check)
  const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : check.status === 'warning' ? '⚠️' : 'ℹ️'
  console.log(`${icon} [${check.category}] ${check.name}: ${check.details}`)
}

// Check 1: NPM Audit for vulnerabilities
function checkNpmVulnerabilities(projectPath: string, projectName: string): void {
  log(`Checking ${projectName} for npm vulnerabilities...`)
  try {
    const result = execSync(`cd ${projectPath} && npm audit --json 2>/dev/null || true`, { encoding: 'utf-8' })
    const audit = JSON.parse(result || '{}')
    
    const vulns = audit.metadata?.vulnerabilities || {}
    const critical = vulns.critical || 0
    const high = vulns.high || 0
    const moderate = vulns.moderate || 0
    
    if (critical > 0 || high > 0) {
      addResult({
        name: `${projectName} Dependencies`,
        category: 'Dependencies',
        status: 'fail',
        details: `Critical: ${critical}, High: ${high}, Moderate: ${moderate}`,
        recommendation: `Run 'npm audit fix' in ${projectPath} to fix vulnerabilities`
      })
    } else if (moderate > 0) {
      addResult({
        name: `${projectName} Dependencies`,
        category: 'Dependencies',
        status: 'warning',
        details: `Moderate vulnerabilities: ${moderate}`,
        recommendation: `Run 'npm audit' for details`
      })
    } else {
      addResult({
        name: `${projectName} Dependencies`,
        category: 'Dependencies',
        status: 'pass',
        details: 'No known vulnerabilities'
      })
    }
  } catch {
    addResult({
      name: `${projectName} Dependencies`,
      category: 'Dependencies',
      status: 'warning',
      details: 'Could not run npm audit'
    })
  }
}

// Check 2: Check for secrets in code
function checkForSecrets(): void {
  log('Scanning for hardcoded secrets...')
  
  const secretPatterns = [
    { pattern: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, name: 'API Key' },
    { pattern: /password\s*[:=]\s*["'][^"']+["']/gi, name: 'Password' },
    { pattern: /secret\s*[:=]\s*["'][^"']+["']/gi, name: 'Secret' },
    { pattern: /connection[_-]?string\s*[:=]\s*["'][^"']+["']/gi, name: 'Connection String' },
    { pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, name: 'JWT Token' },
    { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, name: 'Private Key' },
  ]
  
  const excludeDirs = ['node_modules', 'dist', '.git', 'coverage']
  const includeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.env']
  
  function scanDirectory(dir: string): string[] {
    const findings: string[] = []
    
    try {
      const files = fs.readdirSync(dir)
      
      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)
        
        if (stat.isDirectory()) {
          if (!excludeDirs.includes(file)) {
            findings.push(...scanDirectory(filePath))
          }
        } else if (includeExtensions.some(ext => file.endsWith(ext))) {
          // Skip example files
          if (file.includes('.example') || file.includes('.sample')) continue
          
          const content = fs.readFileSync(filePath, 'utf-8')
          
          for (const { pattern, name } of secretPatterns) {
            const matches = content.match(pattern)
            if (matches) {
              // Ignore false positives (environment variable references)
              const realMatches = matches.filter(m => 
                !m.includes('process.env') && 
                !m.includes('import.meta.env') &&
                !m.includes('${')
              )
              
              if (realMatches.length > 0) {
                findings.push(`${name} found in ${filePath}`)
              }
            }
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
    
    return findings
  }
  
  const findings = scanDirectory(process.cwd())
  
  if (findings.length > 0) {
    addResult({
      name: 'Hardcoded Secrets',
      category: 'Secrets',
      status: 'fail',
      details: `Found ${findings.length} potential secrets:\n  - ${findings.slice(0, 5).join('\n  - ')}`,
      recommendation: 'Remove hardcoded secrets and use environment variables'
    })
  } else {
    addResult({
      name: 'Hardcoded Secrets',
      category: 'Secrets',
      status: 'pass',
      details: 'No hardcoded secrets detected'
    })
  }
}

// Check 3: Security headers in HTML
function checkSecurityHeaders(): void {
  log('Checking security headers in HTML...')
  
  const indexHtml = path.join(process.cwd(), 'frontend', 'index.html')
  
  if (!fs.existsSync(indexHtml)) {
    addResult({
      name: 'Security Headers',
      category: 'Headers',
      status: 'warning',
      details: 'index.html not found'
    })
    return
  }
  
  const content = fs.readFileSync(indexHtml, 'utf-8')
  
  const requiredHeaders = [
    { name: 'Content-Security-Policy', pattern: /Content-Security-Policy/i },
    { name: 'X-Content-Type-Options', pattern: /X-Content-Type-Options/i },
    { name: 'X-Frame-Options', pattern: /X-Frame-Options/i },
    { name: 'X-XSS-Protection', pattern: /X-XSS-Protection/i },
  ]
  
  const missing: string[] = []
  const present: string[] = []
  
  for (const header of requiredHeaders) {
    if (header.pattern.test(content)) {
      present.push(header.name)
    } else {
      missing.push(header.name)
    }
  }
  
  if (missing.length > 0) {
    addResult({
      name: 'Security Headers',
      category: 'Headers',
      status: 'warning',
      details: `Missing headers: ${missing.join(', ')}`,
      recommendation: 'Add meta tags for security headers or configure server headers'
    })
  } else {
    addResult({
      name: 'Security Headers',
      category: 'Headers',
      status: 'pass',
      details: `All required headers present: ${present.join(', ')}`
    })
  }
}

// Check 4: HTTPS enforcement
function checkHttpsEnforcement(): void {
  log('Checking HTTPS enforcement...')
  
  const bicepFile = path.join(process.cwd(), 'infra', 'main.bicep')
  
  if (!fs.existsSync(bicepFile)) {
    addResult({
      name: 'HTTPS Enforcement',
      category: 'Transport',
      status: 'warning',
      details: 'Bicep file not found'
    })
    return
  }
  
  const content = fs.readFileSync(bicepFile, 'utf-8')
  
  if (content.includes('httpsOnly: true')) {
    addResult({
      name: 'HTTPS Enforcement',
      category: 'Transport',
      status: 'pass',
      details: 'HTTPS-only mode enabled in Azure configuration'
    })
  } else {
    addResult({
      name: 'HTTPS Enforcement',
      category: 'Transport',
      status: 'fail',
      details: 'HTTPS-only mode not found in configuration',
      recommendation: 'Add httpsOnly: true to Azure resource configuration'
    })
  }
}

// Check 5: Managed Identity usage
function checkManagedIdentity(): void {
  log('Checking Managed Identity configuration...')
  
  const bicepFile = path.join(process.cwd(), 'infra', 'main.bicep')
  const dbService = path.join(process.cwd(), 'backend', 'src', 'services', 'database.ts')
  
  let bicepCheck = false
  let codeCheck = false
  
  if (fs.existsSync(bicepFile)) {
    const content = fs.readFileSync(bicepFile, 'utf-8')
    bicepCheck = content.includes("type: 'SystemAssigned'") || content.includes("type: 'UserAssigned'")
  }
  
  if (fs.existsSync(dbService)) {
    const content = fs.readFileSync(dbService, 'utf-8')
    codeCheck = content.includes('DefaultAzureCredential')
  }
  
  if (bicepCheck && codeCheck) {
    addResult({
      name: 'Managed Identity',
      category: 'Authentication',
      status: 'pass',
      details: 'Managed Identity configured in infrastructure and code'
    })
  } else if (bicepCheck || codeCheck) {
    addResult({
      name: 'Managed Identity',
      category: 'Authentication',
      status: 'warning',
      details: `Partial configuration - Bicep: ${bicepCheck}, Code: ${codeCheck}`,
      recommendation: 'Ensure both infrastructure and code use Managed Identity'
    })
  } else {
    addResult({
      name: 'Managed Identity',
      category: 'Authentication',
      status: 'fail',
      details: 'Managed Identity not detected',
      recommendation: 'Configure Managed Identity for Azure resources'
    })
  }
}

// Check 6: Input validation
function checkInputValidation(): void {
  log('Checking input validation...')
  
  const backendDir = path.join(process.cwd(), 'backend', 'src')
  
  if (!fs.existsSync(backendDir)) {
    addResult({
      name: 'Input Validation',
      category: 'Validation',
      status: 'warning',
      details: 'Backend source not found'
    })
    return
  }
  
  // Check for Zod usage
  const modelsFile = path.join(backendDir, 'models', 'index.ts')
  
  if (fs.existsSync(modelsFile)) {
    const content = fs.readFileSync(modelsFile, 'utf-8')
    
    if (content.includes("from 'zod'") && content.includes('.safeParse')) {
      addResult({
        name: 'Input Validation',
        category: 'Validation',
        status: 'pass',
        details: 'Schema validation (Zod) implemented'
      })
    } else if (content.includes("from 'zod'")) {
      addResult({
        name: 'Input Validation',
        category: 'Validation',
        status: 'warning',
        details: 'Zod imported but safeParse not found',
        recommendation: 'Ensure all inputs are validated with .safeParse()'
      })
    } else {
      addResult({
        name: 'Input Validation',
        category: 'Validation',
        status: 'fail',
        details: 'No schema validation library detected',
        recommendation: 'Implement input validation with Zod or similar'
      })
    }
  }
}

// Check 7: Rate limiting
function checkRateLimiting(): void {
  log('Checking rate limiting...')
  
  const scraperFile = path.join(process.cwd(), 'backend', 'src', 'services', 'priceScraper.ts')
  
  if (fs.existsSync(scraperFile)) {
    const content = fs.readFileSync(scraperFile, 'utf-8')
    
    if (content.includes('rateLimited') || content.includes('MIN_REQUEST_INTERVAL') || content.includes('setTimeout')) {
      addResult({
        name: 'Rate Limiting',
        category: 'DoS Protection',
        status: 'pass',
        details: 'Rate limiting implemented for external requests'
      })
    } else {
      addResult({
        name: 'Rate Limiting',
        category: 'DoS Protection',
        status: 'warning',
        details: 'Rate limiting not detected in price scraper',
        recommendation: 'Add rate limiting to prevent abuse'
      })
    }
  } else {
    addResult({
      name: 'Rate Limiting',
      category: 'DoS Protection',
      status: 'warning',
      details: 'Price scraper service not found'
    })
  }
}

// Check 8: Cosmos DB security
function checkDatabaseSecurity(): void {
  log('Checking database security...')
  
  const bicepFile = path.join(process.cwd(), 'infra', 'main.bicep')
  
  if (!fs.existsSync(bicepFile)) {
    addResult({
      name: 'Database Security',
      category: 'Database',
      status: 'warning',
      details: 'Infrastructure file not found'
    })
    return
  }
  
  const content = fs.readFileSync(bicepFile, 'utf-8')
  
  const checks = {
    disableLocalAuth: content.includes('disableLocalAuth: true'),
    backup: content.includes('backupPolicy'),
    rbac: content.includes('sqlRoleAssignments'),
  }
  
  const passed = Object.values(checks).filter(Boolean).length
  const total = Object.keys(checks).length
  
  if (passed === total) {
    addResult({
      name: 'Database Security',
      category: 'Database',
      status: 'pass',
      details: 'Cosmos DB configured with AAD-only auth, backups, and RBAC'
    })
  } else {
    const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    addResult({
      name: 'Database Security',
      category: 'Database',
      status: 'warning',
      details: `Missing configurations: ${missing.join(', ')}`,
      recommendation: 'Enable all database security features'
    })
  }
}

// Main execution
async function runAudit(): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('🔒 PriceWatch Security Audit')
  console.log('='.repeat(60) + '\n')
  
  const projectRoot = process.cwd()
  
  // Run all checks
  checkNpmVulnerabilities(path.join(projectRoot, 'frontend'), 'Frontend')
  checkNpmVulnerabilities(path.join(projectRoot, 'backend'), 'Backend')
  checkForSecrets()
  checkSecurityHeaders()
  checkHttpsEnforcement()
  checkManagedIdentity()
  checkInputValidation()
  checkRateLimiting()
  checkDatabaseSecurity()
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 AUDIT SUMMARY')
  console.log('='.repeat(60))
  
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const warnings = results.filter(r => r.status === 'warning').length
  
  console.log(`\n✅ Passed:   ${passed}`)
  console.log(`❌ Failed:   ${failed}`)
  console.log(`⚠️  Warnings: ${warnings}`)
  console.log(`📋 Total:    ${results.length}`)
  
  // Recommendations
  const recommendations = results.filter(r => r.recommendation)
  if (recommendations.length > 0) {
    console.log('\n📝 RECOMMENDATIONS:')
    recommendations.forEach((r, i) => {
      console.log(`${i + 1}. [${r.name}] ${r.recommendation}`)
    })
  }
  
  // Exit code
  if (failed > 0) {
    console.log('\n❌ Security audit FAILED - please address the issues above')
    process.exit(1)
  } else if (warnings > 0) {
    console.log('\n⚠️  Security audit completed with warnings')
    process.exit(0)
  } else {
    console.log('\n✅ Security audit PASSED')
    process.exit(0)
  }
}

runAudit().catch(console.error)
