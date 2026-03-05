const { CosmosClient } = require('@azure/cosmos');

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

// Get user info from request headers
function getUserInfo(req) {
  const clientPrincipal = req.headers['x-ms-client-principal'];
  if (clientPrincipal) {
    const decoded = JSON.parse(Buffer.from(clientPrincipal, 'base64').toString('utf8'));
    return {
      userId: decoded.userId || decoded.userDetails,
      email: decoded.userDetails,
      provider: decoded.identityProvider
    };
  }
  return { userId: 'demo-user', email: 'demo@example.com', provider: 'demo' };
}

module.exports = async function (context, req) {
  const method = req.method.toUpperCase();
  const userInfo = getUserInfo(req);

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
    const { resource } = await container.item(userInfo.userId, userInfo.userId).read();
    
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
  
  const profile = {
    id: userInfo.userId,
    email: userInfo.email,
    name: updates.name || '',
    phoneNumber: updates.phoneNumber || null,
    notificationPreference: updates.notificationPreference || 'email',
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
    id: userInfo.userId,
    email: userInfo.email,
    name: '',
    phoneNumber: null,
    notificationPreference: 'email',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
