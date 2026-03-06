const { CosmosClient } = require('@azure/cosmos');
const { getAuthenticatedUser, requireAuth } = require('../shared/auth');

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
    container = database.container('users');
  }
  return container;
}

module.exports = async function (context, req) {
  const method = req.method.toUpperCase();
  
  // Require authentication
  const authError = await requireAuth(req, context);
  if (authError) {
    context.res = authError;
    return;
  }
  
  const userInfo = await getAuthenticatedUser(req, context);

  try {
    switch (method) {
      case 'GET':
        return await getProfile(context, userInfo);
      
      case 'PUT':
        return await updateProfile(context, req, userInfo);
      
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

async function getProfile(context, userInfo) {
  try {
    const container = await getContainer();
    const { resource } = await container.item(userInfo.id, userInfo.id).read();
    
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: resource || createDefaultProfile(userInfo)
    };
  } catch (error) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: createDefaultProfile(userInfo)
    };
  }
}

async function updateProfile(context, req, userInfo) {
  const updates = req.body || {};
  
  // Allow user to set their own notification email
  const notificationEmail = updates.email || userInfo.email;
  
  const profile = {
    id: userInfo.id,
    authEmail: userInfo.email,
    email: notificationEmail, // This is where notifications will be sent
    name: updates.name || userInfo.name || '',
    emailNotifications: updates.emailNotifications !== false, // Default true
    updatedAt: new Date().toISOString()
  };

  try {
    const container = await getContainer();
    const { resource } = await container.items.upsert(profile);
    
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: resource
    };
  } catch (error) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: profile
    };
  }
}

function createDefaultProfile(userInfo) {
  return {
    id: userInfo.id,
    email: userInfo.email,
    name: userInfo.name || '',
    emailNotifications: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
