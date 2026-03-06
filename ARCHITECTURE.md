# Price Tracker App - Technical Architecture & Development Guide

## Overview

A price tracking application that monitors product prices across major retail stores and sends email notifications when prices drop below a target threshold. Built using Azure services within the Visual Studio Enterprise free credits ($150/month).

**Live App:** https://delightful-glacier-06ac71a1e.2.azurestaticapps.net

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Users["👤 Users"]
        BROWSER[Web Browser]
    end

    subgraph GitHub["GitHub"]
        REPO[("📦 Repository<br/>gauravojha89/price-tracker")]
        ACTIONS["⚙️ GitHub Actions<br/>CI/CD Pipeline"]
        OIDC["🔑 OIDC Token"]
    end

    subgraph Azure["☁️ Azure Cloud"]
        subgraph Identity["🔐 Identity & Security"]
            SWA_AUTH["SWA Built-in Auth<br/>/.auth/login/aad"]
            MI["🪪 Managed Identity<br/>User-Assigned"]
            FIC["🔗 Federated Identity<br/>Credential"]
        end

        subgraph Hosting["🌐 Azure Static Web Apps (Free)"]
            SWA["Static Web App<br/>delightful-glacier-06ac71a1e"]
            subgraph Frontend["React SPA"]
                REACT["⚛️ React 18 + TypeScript<br/>Vite 5 + Tailwind CSS"]
            end
            subgraph Functions["Serverless Functions"]
                API_PRODUCTS["📦 /api/products"]
                API_CHECK["🔍 /api/check-price"]
                API_SEARCH["🔎 /api/search-stores"]
                API_NOTIFY["📧 /api/notifications"]
                API_USER["👤 /api/user"]
            end
        end

        subgraph Data["💾 Data Layer"]
            COSMOS[("🗄️ Cosmos DB<br/>Serverless (Free Tier)<br/>NoSQL API")]
            PRODUCTS_DB["products container"]
            USERS_DB["users container"]
        end

        subgraph Comms["📬 Communication"]
            ACS["📧 Azure Communication<br/>Services"]
            EMAIL["✉️ Email Service<br/>DoNotReply@...azurecomm.net"]
        end
    end

    subgraph External["🏪 External Retailers"]
        AMAZON["Amazon"]
        WALMART["Walmart"]
        TARGET["Target"]
        BESTBUY["Best Buy"]
        EBAY["eBay"]
        MORE["+ 5 more stores"]
    end

    %% User Flow
    BROWSER -->|"HTTPS"| SWA
    SWA -->|"Serves"| REACT
    BROWSER -->|"Microsoft Login"| SWA_AUTH
    SWA_AUTH -->|"x-ms-client-principal"| Functions

    %% API Flow
    REACT -->|"REST API"| Functions
    API_PRODUCTS -->|"DefaultAzureCredential"| COSMOS
    API_CHECK -->|"DefaultAzureCredential"| COSMOS
    API_USER -->|"DefaultAzureCredential"| COSMOS
    COSMOS --- PRODUCTS_DB
    COSMOS --- USERS_DB

    %% Price Checking
    API_CHECK -->|"Web Scraping"| External
    API_SEARCH -->|"Cross-Store Search"| External

    %% Notifications
    API_NOTIFY -->|"Managed Identity"| ACS
    ACS --> EMAIL

    %% CI/CD Flow
    REPO -->|"Push to main"| ACTIONS
    ACTIONS -->|"OIDC Auth"| OIDC
    OIDC -->|"Federated Auth"| FIC
    FIC -->|"Grants Access"| MI
    ACTIONS -->|"Deploy"| SWA

    %% Styling
    classDef azure fill:#0078D4,stroke:#005A9E,color:#fff
    classDef security fill:#107C10,stroke:#0B5C0B,color:#fff
    classDef external fill:#FF9900,stroke:#CC7A00,color:#fff
    classDef github fill:#24292E,stroke:#1B1F23,color:#fff

    class SWA,COSMOS,ACS,EMAIL azure
    class SWA_AUTH,MI,FIC security
    class AMAZON,WALMART,TARGET,BESTBUY,EBAY,MORE external
    class REPO,ACTIONS,OIDC github
```

### Security Model

| Component | Security Mechanism | Details |
|-----------|-------------------|---------|
| **User Authentication** | SWA Built-in Auth | Microsoft Entra ID via `/.auth/login/aad` |
| **API Authorization** | x-ms-client-principal | Automatic header injection by SWA |
| **Cosmos DB Access** | Managed Identity | `DefaultAzureCredential` - no connection strings |
| **Email Service** | Managed Identity | Azure Communication Services via MI |
| **CI/CD Pipeline** | Federated Identity Credentials | OIDC keyless auth from GitHub Actions |
| **Secrets** | None in code | Zero hardcoded credentials anywhere |

---

## Development Process Flow

```mermaid
flowchart TD
    subgraph Phase1["Phase 1: Azure Infrastructure Setup"]
        A1[1. Create Resource Group<br/>rg-pricewatch-dev<br/>West US 2]
        A2[2. Create Cosmos DB<br/>Free Tier - Serverless<br/>NoSQL API]
        A3[3. Create Database & Containers<br/>pricetracker DB<br/>products + users containers]
        A4[4. Create Azure Communication Services<br/>Email capability]
        A5[5. Configure Email Domain<br/>Azure-managed domain]
        A1 --> A2 --> A3 --> A4 --> A5
    end

    subgraph Phase2["Phase 2: Frontend Development"]
        B1[1. Initialize Vite + React + TypeScript]
        B2[2. Configure Tailwind CSS<br/>Custom design tokens]
        B3[3. Build Components<br/>Navbar, ProductCard,<br/>AddProductModal, CompareModal]
        B4[4. Create Pages<br/>Landing, Dashboard, Profile]
        B5[5. Implement simpleApi.ts<br/>API service layer]
        B1 --> B2 --> B3 --> B4 --> B5
    end

    subgraph Phase3["Phase 3: Backend API Development"]
        C1[1. Create swa-api folder<br/>Azure Functions v3 format]
        C2[2. Products API<br/>GET/POST/DELETE operations]
        C3[3. User Profile API<br/>GET/PUT operations]
        C4[4. Price Scraping API<br/>HTML parsing with regex]
        C5[5. Email Notification API<br/>Azure Communication Services SDK]
        C6[6. Cross-Store Search API<br/>Search URL generator]
        C1 --> C2 --> C3 --> C4 --> C5 --> C6
    end

    subgraph Phase4["Phase 4: Deployment & CI/CD"]
        D1[1. Create GitHub Repository]
        D2[2. Create Azure Static Web App<br/>Link to GitHub repo]
        D3[3. Configure App Settings<br/>Cosmos DB connection string<br/>ACS connection string]
        D4[4. GitHub Actions auto-deploys<br/>on push to main]
        D1 --> D2 --> D3 --> D4
    end

    Phase1 --> Phase2
    Phase2 --> Phase3
    Phase3 --> Phase4
```

---

## User & Data Flow

```mermaid
flowchart LR
    subgraph UserActions["User Actions"]
        U1[User visits app]
        U2[Adds product URL]
        U3[Sets target price]
        U4[Views dashboard]
        U5[Clicks Compare]
    end

    subgraph AppLogic["Application Logic"]
        L1[Frontend loads<br/>from Azure SWA]
        L2[API parses URL<br/>detects store]
        L3[Scrapes current price<br/>from store website]
        L4[Saves to Cosmos DB]
        L5[Generates search links<br/>for 12+ stores]
    end

    subgraph PriceMonitoring["Daily Price Check (Scheduled)"]
        P1[Timer triggers<br/>check-all-prices API]
        P2[Fetches all products<br/>from Cosmos DB]
        P3[Scrapes each product<br/>updates price history]
        P4{Price ≤<br/>Target?}
        P5[Send email alert<br/>via Azure ACS]
        P6[Record notification<br/>prevent duplicate alerts]
    end

    U1 --> L1
    U2 --> L2 --> L3 --> L4
    U3 --> L4
    U4 --> L4
    U5 --> L5

    P1 --> P2 --> P3 --> P4
    P4 -->|Yes| P5 --> P6
    P4 -->|No| P2
```

---

## Azure Resources Used

| Resource | Service | Purpose | Monthly Cost |
|----------|---------|---------|--------------|
| `rg-pricewatch-dev` | Resource Group | Container for all resources | $0 |
| Azure Static Web Apps | Hosting | Frontend + APIs | $0 (Free tier) |
| `cosmos-pricewatch-dev-*` | Cosmos DB (Serverless) | Products & users data | $0 (1000 RU/s free) |
| `acs-pricewatch-dev-*` | Azure Communication Services | Price drop email notifications | $0 (first 100 emails/mo) |

**Region:** West US 2

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tooling & dev server |
| Tailwind CSS | 3.x | Utility-first styling |
| Framer Motion | 11.x | Animations |
| Lucide React | - | Icon library |
| React Router | 6.x | Client-side routing |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime |
| Azure Functions | v3 (SWA format) | Serverless compute |
| @azure/cosmos | 4.x | Cosmos DB SDK |
| @azure/communication-email | 1.x | Email sending |
| node-fetch | 2.x | HTTP requests for scraping |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/products` | GET | List all tracked products |
| `/api/products` | POST | Add new product to track |
| `/api/products/{id}` | DELETE | Remove product |
| `/api/user/profile` | GET | Get user settings |
| `/api/user/profile` | PUT | Update user settings & email |
| `/api/check-price` | POST | Scrape single product price |
| `/api/check-all-prices` | POST | Batch price check + send alerts |
| `/api/search-stores` | POST | Get cross-store search links |
| `/api/notifications/test` | POST | Send test email |

---

## Database Schema

### Cosmos DB Structure
```
Database: pricetracker
│
├── Container: products
│   ├── id (string) - UUID
│   ├── userId (string) - "demo-user-123"
│   ├── name (string) - Product name
│   ├── url (string) - Product URL
│   ├── store (string) - Store name
│   ├── currentPrice (number)
│   ├── originalPrice (number)
│   ├── targetPrice (number) - Alert threshold
│   ├── priceHistory (array)
│   │   └── { price: number, date: string }
│   ├── isOnSale (boolean)
│   ├── lastChecked (string) - ISO date
│   ├── lastNotified (string) - ISO date
│   ├── createdAt (string)
│   └── updatedAt (string)
│
└── Container: users
    ├── id (string) - "demo-user-123"
    ├── name (string)
    ├── email (string) - Notification email
    ├── emailNotifications (boolean)
    ├── createdAt (string)
    └── updatedAt (string)
```

---

## Supported Stores (24+)

The app supports price tracking from these stores:

| Category | Stores |
|----------|--------|
| **General Retail** | Amazon, Walmart, Target, Costco, eBay |
| **Electronics** | Best Buy, Newegg, B&H Photo, Samsung, Dell, HP, Lenovo |
| **Fashion** | Macy's, Nordstrom, Kohl's, Zappos, 6pm, Gilt |
| **Beauty** | Sephora, Ulta |
| **Home** | Home Depot, Lowe's |
| **Tech** | Apple |
| **Any URL** | Supports any website (price detection best-effort) |

---

## Key Features

### 1. Universal URL Support
- Track products from any retail website
- Automatic store detection from URL
- Fallback to domain name parsing for unknown stores

### 2. Price Scraping
- HTML parsing with regex patterns
- Store-specific selectors for accuracy
- Updates price history on each check

### 3. Cross-Store Search
- "Compare" button on each product
- Generates search links for 12 major retailers
- Helps find best prices across stores

### 4. Email Notifications
- HTML-formatted professional emails
- "Buy Now" button links to exact product URL
- Duplicate alert prevention (24-hour cooldown)

### 5. Price History
- 90-day rolling history
- Visual price trend display
- On-sale badge when price drops

---

## Project Structure

```
price-tracker/
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Navbar.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   ├── AddProductModal.tsx
│   │   │   └── CompareModal.tsx
│   │   ├── pages/              # Route pages
│   │   │   ├── LandingPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   └── ProfilePage.tsx
│   │   ├── services/
│   │   │   └── simpleApi.ts    # API client
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript types
│   │   └── styles/
│   │       └── index.css       # Global styles
│   ├── package.json
│   └── vite.config.ts
│
├── swa-api/                     # Azure Functions
│   ├── products/               # Products CRUD
│   │   ├── index.js
│   │   └── function.json
│   ├── check-price/            # Single price check
│   ├── check-all-prices/       # Batch check + notify
│   ├── search-stores/          # Cross-store search
│   ├── user/                   # User profile
│   ├── notifications/          # Test notifications
│   ├── package.json
│   └── host.json
│
├── staticwebapp.config.json    # SWA routing config
├── .github/workflows/          # GitHub Actions CI/CD
└── README.md
```

---

## Environment Variables (Azure App Settings)

| Variable | Description |
|----------|-------------|
| `COSMOS_CONNECTION_STRING` | Cosmos DB connection string |
| `ACS_CONNECTION_STRING` | Azure Communication Services connection |
| `ACS_SENDER_EMAIL` | Sender email address |

---

## Deployment

### Automatic Deployment
- Push to `main` branch triggers GitHub Actions
- Actions builds frontend and deploys to Azure SWA
- APIs deploy automatically with frontend

### Manual Deployment
```bash
# Build frontend
cd frontend && npm run build

# Deploy via Azure CLI
az staticwebapp deploy --app-name <your-app>
```

---

## Cost Analysis

| Service | Free Tier Limit | Expected Usage | Cost |
|---------|-----------------|----------------|------|
| Static Web Apps | 100 GB bandwidth | ~1 GB | $0 |
| Cosmos DB | 1000 RU/s, 25 GB | Minimal | $0 |
| Communication Services | 100 emails/month | ~50 | $0 |
| **Total** | | | **$0/month** |

---

## Future Enhancements

1. **Scheduled Price Checks** - Azure Timer Trigger for daily automatic checks
2. **Price Charts** - Visual graphs showing price history trends
3. **Browser Extension** - Add products directly from store pages
4. **Multiple Users** - Azure AD B2C authentication
5. **Price Predictions** - ML-based price trend forecasting

---

## Repository

**GitHub:** https://github.com/gauravojha89/price-tracker

**Live App:** https://delightful-glacier-06ac71a1e.2.azurestaticapps.net
