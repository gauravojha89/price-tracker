// Main entry point for Azure Functions
// This file imports all function modules to register them with the Azure Functions runtime

import './functions/products.js'
import './functions/userProfile.js'
import './functions/priceChecker.js'

// Re-export for any direct imports
export * from './functions/products.js'
export * from './functions/userProfile.js'
export * from './functions/priceChecker.js'
