# PriceWatch - Smart Price Tracking Application

A modern, secure price tracking application that monitors product prices and notifies users when prices drop. Built with React, Azure Functions, and Cosmos DB.

## Features

- 🔍 **Track Products**: Add products from Amazon, Best Buy, Target, Walmart, Costco, and more
- 📉 **Daily Price Checks**: Automated daily price monitoring
- 📧 **Instant Notifications**: Email or SMS alerts when prices drop
- 🔒 **Enterprise Security**: Azure AD B2C authentication, Managed Identity, no hardcoded secrets
- 🎨 **Modern UI**: Clean, minimalistic Apple-inspired design
- ☁️ **Serverless**: Zero infrastructure management, pay-per-use pricing

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Static Web App │────▶│  Azure Functions │────▶│   Cosmos DB     │
│    (React)      │     │     (Node.js)    │     │   (Serverless)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
         ┌─────────────────┐   ┌──────────────────┐
         │  Azure AD B2C   │   │  Communication   │
         │ (Authentication)│   │    Services      │
         └─────────────────┘   └──────────────────┘
```

## Security Features

- **Azure AD B2C Authentication**: Secure user authentication
- **Managed Identity**: No connection strings or secrets in code
- **Federated Identity Credentials**: Keyless CI/CD with GitHub Actions
- **HTTPS Only**: TLS 1.2+ enforced
- **Input Validation**: Zod schema validation on all inputs
- **Security Headers**: CSP, X-Frame-Options, X-XSS-Protection
- **Rate Limiting**: Protection against abuse
- **RBAC**: Least privilege access model

## Prerequisites

- Node.js 20+
- Azure CLI
- Azure Subscription with credits
- GitHub Account

## Local Development

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
npm run start
```

## Deployment

### 1. Configure Azure Resources

1. Create a Resource Group:
```bash
az group create --name rg-pricewatch-dev --location eastus
```

2. Update parameters in `infra/main.parameters.json`:
   - `githubRepo`: Your GitHub username/repo
   - `b2cTenantName`: Your Azure AD B2C tenant name
   - `b2cClientId`: Your B2C application client ID

3. Deploy infrastructure:
```bash
az deployment group create \
  --resource-group rg-pricewatch-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

### 2. Configure Azure AD B2C

1. Create an Azure AD B2C tenant
2. Register an application with:
   - Redirect URI: `https://[your-static-web-app].azurestaticapps.net`
   - Enable ID tokens
3. Create a Sign Up/Sign In user flow (B2C_1_signupsignin)
4. Note the tenant name and client ID

### 3. Configure GitHub Secrets

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Deployment identity client ID |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `AZURE_B2C_TENANT_NAME` | B2C tenant name |
| `AZURE_B2C_CLIENT_ID` | B2C app client ID |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA deployment token |

### 4. Push to Deploy

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

The GitHub Actions workflow will:
1. Run security scans (CodeQL, Trivy)
2. Build frontend and backend
3. Deploy infrastructure (Bicep)
4. Deploy to Azure Functions and Static Web Apps

## Cost Optimization

This application is designed to minimize costs using Azure free tier:

| Resource | Plan | Free Allowance |
|----------|------|----------------|
| Static Web App | Free | Unlimited |
| Azure Functions | Consumption | 1M executions/month |
| Cosmos DB | Free Tier | 1000 RU/s, 25GB |
| Azure AD B2C | Free | 50,000 MAU |
| Communication Services | Pay-as-you-go | ~$0.0075/email |

**Estimated Cost**: $0-5/month for typical usage

## Security Testing

Run the security audit:
```bash
npx ts-node security/audit.ts
```

See [PENETRATION_TEST_CHECKLIST.md](security/PENETRATION_TEST_CHECKLIST.md) for detailed security testing procedures.

## Supported Stores

- Amazon
- Best Buy
- Target
- Walmart
- Costco
- Apple
- Newegg
- Macy's
- Nordstrom
- Home Depot

## Project Structure

```
price-tracker/
├── frontend/           # React + Vite frontend
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page components
│   │   ├── services/   # API and auth services
│   │   └── styles/     # Global styles
│   └── ...
├── backend/            # Azure Functions backend
│   ├── src/
│   │   ├── functions/  # HTTP triggers
│   │   ├── services/   # Business logic
│   │   └── models/     # Data models
│   └── ...
├── infra/              # Azure Bicep templates
├── security/           # Security audit tools
└── .github/workflows/  # CI/CD pipelines
```

## License

MIT
