# PriceWatch Security Hardening Guide

This document describes the security hardening measures implemented for the PriceWatch application's Azure Cosmos DB database.

## Overview

Three layers of security have been implemented:
1. **Azure RBAC** - Control plane access (who can manage the resource)
2. **Cosmos DB Native RBAC** - Data plane access (who can read/write data)
3. **Audit Logging** - Track all access and operations

---

## 1. Azure RBAC for Cosmos DB

Azure Role-Based Access Control restricts who can manage the Cosmos DB account.

### Roles Assigned

| Role | Description | Scope |
|------|-------------|-------|
| Cosmos DB Account Reader | View account properties, keys (read-only) | Account level |
| Cosmos DB Operator | Manage account (no data access) | Account level |

### Commands Used

```bash
# Assign Account Reader role
az role assignment create \
  --assignee "<user-principal-id>" \
  --role "Cosmos DB Account Reader Role" \
  --scope "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pricewatch-dev-7hdenjgb43big"

# Assign Operator role
az role assignment create \
  --assignee "<user-principal-id>" \
  --role "Cosmos DB Operator" \
  --scope "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pricewatch-dev-7hdenjgb43big"
```

### Verify Assignments

```bash
az role assignment list \
  --scope "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pricewatch-dev-7hdenjgb43big" \
  --query "[].{principal:principalName, role:roleDefinitionName}" \
  -o table
```

---

## 2. Cosmos DB Native RBAC (Data Plane)

Cosmos DB has its own RBAC system for controlling data access, separate from Azure RBAC.

### Built-in Roles

| Role | Permissions |
|------|-------------|
| Cosmos DB Built-in Data Reader | Read all data (SELECT queries) |
| Cosmos DB Built-in Data Contributor | Read + Write all data |

### Commands Used

```bash
# List available role definitions
az cosmosdb sql role definition list \
  --account-name cosmos-pricewatch-dev-7hdenjgb43big \
  --resource-group rg-pricewatch-dev \
  --query "[].roleName" -o table

# Assign Data Contributor role
az cosmosdb sql role assignment create \
  --account-name cosmos-pricewatch-dev-7hdenjgb43big \
  --resource-group rg-pricewatch-dev \
  --scope "/" \
  --principal-id "<user-object-id>" \
  --role-definition-name "Cosmos DB Built-in Data Contributor"
```

### Best Practices

- Use **Data Reader** for users who only need to view data
- Use **Data Contributor** sparingly (admin only)
- Create custom roles for specific container access if needed

---

## 3. Audit Logging

All Cosmos DB operations are logged to Azure Log Analytics for security monitoring.

### Diagnostic Settings Configured

| Log Category | Description |
|--------------|-------------|
| DataPlaneRequests | All read/write operations on data |
| ControlPlaneRequests | Account management operations |

### Commands Used

```bash
# Create diagnostic settings
az monitor diagnostic-settings create \
  --name "cosmos-audit-logs" \
  --resource "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pricewatch-dev-7hdenjgb43big" \
  --workspace "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.OperationalInsights/workspaces/log-pricewatch-dev-7hdenjgb43big" \
  --logs '[{"category":"DataPlaneRequests","enabled":true},{"category":"ControlPlaneRequests","enabled":true}]'
```

### Viewing Audit Logs

1. Go to **Azure Portal** → **Log Analytics** → `log-pricewatch-dev-7hdenjgb43big`
2. Click **Logs** in the left menu
3. Run queries:

**All recent operations:**
```kusto
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.DOCUMENTDB"
| project TimeGenerated, OperationName, requestResourceType_s, userAgent_s, statusCode_s
| order by TimeGenerated desc
| take 100
```

**Failed requests (potential attacks):**
```kusto
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.DOCUMENTDB"
| where statusCode_s >= 400
| project TimeGenerated, OperationName, statusCode_s, requestResourceType_s
| order by TimeGenerated desc
```

**Operations by user:**
```kusto
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.DOCUMENTDB"
| summarize count() by userAgent_s
| order by count_ desc
```

---

## Application-Level Security

In addition to infrastructure security, the application enforces user data isolation:

### User Isolation in API

All product queries include `userId` filter:

```javascript
// swa-api/products/index.js
const { resources } = await container.items.query({
  query: 'SELECT * FROM c WHERE c.userId = @userId',
  parameters: [{ name: '@userId', value: userId }]
}).fetchAll();
```

The `userId` comes from the **SWA authentication token** (server-side), not from user input - preventing spoofing.

### Authentication

- **Provider:** Microsoft (Entra ID) via Azure Static Web Apps built-in auth
- **Protected Routes:** `/api/*`, `/dashboard`, `/profile`
- **Configuration:** `frontend/staticwebapp.config.json`

---

## Adding New Users

### Grant Azure Portal Access

```bash
# Reader access to Cosmos DB account
az role assignment create \
  --assignee "<new-user-email>" \
  --role "Cosmos DB Account Reader Role" \
  --scope "/subscriptions/<sub-id>/resourceGroups/rg-pricewatch-dev/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-pricewatch-dev-7hdenjgb43big"
```

### Grant Data Access (Read Only)

```bash
# First get user's object ID
az ad user show --id "<user-email>" --query id -o tsv

# Assign Data Reader role (read-only)
az cosmosdb sql role assignment create \
  --account-name cosmos-pricewatch-dev-7hdenjgb43big \
  --resource-group rg-pricewatch-dev \
  --scope "/" \
  --principal-id "<user-object-id>" \
  --role-definition-name "Cosmos DB Built-in Data Reader"
```

---

## Resources

- [Azure Cosmos DB RBAC](https://docs.microsoft.com/en-us/azure/cosmos-db/how-to-setup-rbac)
- [Azure RBAC built-in roles](https://docs.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#cosmos-db)
- [Cosmos DB diagnostic logging](https://docs.microsoft.com/en-us/azure/cosmos-db/monitor-cosmos-db)
- [Static Web Apps authentication](https://docs.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)

---

*Last updated: March 2026*
