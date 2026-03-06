const { CosmosClient } = require('@azure/cosmos');
const { getUserId, requireAuth } = require('../shared/auth');

// Initialize Cosmos client lazily
let container = null;

async function getContainer() {
  if (!container) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    
    if (!endpoint) {
      throw new Error('COSMOS_ENDPOINT not configured');
    }
    
    const client = new CosmosClient({ endpoint, key });
    const database = client.database('pricetracker');
    container = database.container('products');
  }
  return container;
}

module.exports = async function (context, req) {
  const method = req.method.toUpperCase();
  const productId = req.params.id;
  
  // Require authentication
  const authError = await requireAuth(req, context);
  if (authError) {
    context.res = authError;
    return;
  }
  
  const userId = await getUserId(req, context);

  try {
    switch (method) {
      case 'GET':
        if (productId) {
          return await getProduct(context, userId, productId);
        }
        return await getProducts(context, userId);
      
      case 'POST':
        return await createProduct(context, req, userId);
      
      case 'DELETE':
        if (!productId) {
          context.res = { status: 400, body: { error: 'Product ID required' } };
          return;
        }
        return await deleteProduct(context, userId, productId);
      
      default:
        context.res = { status: 405, body: { error: 'Method not allowed' } };
    }
  } catch (error) {
    context.log.error('API Error:', error);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Internal server error' }
    };
  }
};

async function getProducts(context, userId) {
  try {
    const container = await getContainer();
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@userId', value: userId }]
      })
      .fetchAll();
    
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: resources
    };
  } catch (error) {
    // Return empty array if database not configured
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: []
    };
  }
}

async function getProduct(context, userId, productId) {
  try {
    const container = await getContainer();
    const { resource } = await container.item(productId, userId).read();
    
    if (!resource) {
      context.res = { status: 404, body: { error: 'Product not found' } };
      return;
    }
    
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: resource
    };
  } catch (error) {
    context.res = { status: 404, body: { error: 'Product not found' } };
  }
}

async function createProduct(context, req, userId) {
  const { name, url, targetPrice } = req.body || {};
  
  if (!name) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Product name is required' }
    };
    return;
  }

  const product = {
    id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    name,
    url: url || null,
    targetPrice: targetPrice ? parseFloat(targetPrice) : null,
    currentPrice: null,
    priceHistory: [],
    isOnSale: false,
    lastChecked: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    const container = await getContainer();
    const { resource } = await container.items.create(product);
    
    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: resource
    };
  } catch (error) {
    context.log.error('Failed to create product:', error);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to save product' }
    };
  }
}

async function deleteProduct(context, userId, productId) {
  try {
    const container = await getContainer();
    await container.item(productId, userId).delete();
    
    context.res = {
      status: 204,
      body: null
    };
  } catch (error) {
    context.res = { status: 404, body: { error: 'Product not found' } };
  }
}
