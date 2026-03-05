// PriceWatch Azure Infrastructure - Simplified
// Uses Azure Static Web Apps with built-in API (no separate Function App needed)
// All resources are free tier eligible

targetScope = 'resourceGroup'

// Parameters
@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string = 'pricewatch'

@description('GitHub repository (owner/repo format)')
param githubRepo string

@description('Azure AD B2C tenant name')
param b2cTenantName string

@description('Azure AD B2C client ID for the application')
param b2cClientId string

// Variables
var resourceSuffix = '${baseName}-${environment}-${uniqueString(resourceGroup().id)}'
var staticWebAppName = 'swa-${resourceSuffix}'
var cosmosDbAccountName = 'cosmos-${resourceSuffix}'
var storageAccountName = take('st${replace(baseName, '-', '')}${environment}${uniqueString(resourceGroup().id)}', 24)
var appInsightsName = 'appi-${resourceSuffix}'
var logAnalyticsName = 'log-${resourceSuffix}'
var communicationServiceName = 'acs-${resourceSuffix}'
var staticWebAppLocation = 'westus2'

// Tags
var tags = {
  Environment: environment
  Application: 'PriceWatch'
  ManagedBy: 'Bicep'
}

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// Cosmos DB Account (Free Tier)
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: cosmosDbAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
  }
}

// Cosmos DB Database
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosDbAccount
  name: 'pricetracker'
  properties: {
    resource: {
      id: 'pricetracker'
    }
  }
}

// Cosmos DB Containers
resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
  }
}

resource productsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'products'
  properties: {
    resource: {
      id: 'products'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
    }
  }
}

resource alertsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'alerts'
  properties: {
    resource: {
      id: 'alerts'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      defaultTtl: 7776000
    }
  }
}

// Azure Communication Services
resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

// Static Web App (Free tier - includes API functions!)
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

// Static Web App App Settings (via config)
resource staticWebAppSettings 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    COSMOS_DB_ENDPOINT: cosmosDbAccount.properties.documentEndpoint
    COSMOS_DB_KEY: cosmosDbAccount.listKeys().primaryMasterKey
    COSMOS_DB_DATABASE: 'pricetracker'
    AZURE_AD_B2C_TENANT: b2cTenantName
    AZURE_AD_B2C_CLIENT_ID: b2cClientId
    AZURE_AD_B2C_POLICY: 'B2C_1_signupsignin'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  }
}

// User Assigned Identity for GitHub Actions
resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-deploy-${resourceSuffix}'
  location: location
  tags: tags
}

// Federated Identity Credential for GitHub Actions
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-actions'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}

// RBAC: Deployment Identity -> Resource Group (Contributor)
resource deploymentRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentity.id, 'contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppDeploymentToken string = staticWebApp.listSecrets().properties.apiKey
output cosmosDbEndpoint string = cosmosDbAccount.properties.documentEndpoint
output communicationServicesName string = communicationService.name
output deploymentIdentityClientId string = deploymentIdentity.properties.clientId
output appInsightsConnectionString string = appInsights.properties.ConnectionString
