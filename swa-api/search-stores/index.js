const fetch = require('node-fetch');

/**
 * Search for a product across multiple stores
 * This helps users find the same product on different retailers
 */
module.exports = async function (context, req) {
  context.log('Cross-store search triggered');
  
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers };
    return;
  }
  
  try {
    const { productName, sourceUrl } = req.body || {};
    
    if (!productName && !sourceUrl) {
      context.res = {
        status: 400,
        headers,
        body: { error: 'Product name or source URL required' }
      };
      return;
    }
    
    let searchQuery = productName;
    
    // If URL provided, try to extract product name
    if (sourceUrl && !productName) {
      searchQuery = await extractProductName(sourceUrl, context);
      if (!searchQuery) {
        context.res = {
          status: 400,
          headers,
          body: { error: 'Could not extract product name from URL' }
        };
        return;
      }
    }
    
    context.log(`Searching for: ${searchQuery}`);
    
    // Search across multiple stores
    const searchResults = await searchAllStores(searchQuery, context);
    
    context.res = {
      status: 200,
      headers,
      body: {
        query: searchQuery,
        results: searchResults
      }
    };
  } catch (error) {
    context.log.error('Search error:', error);
    context.res = {
      status: 500,
      headers,
      body: { error: error.message }
    };
  }
};

/**
 * Extract product name from a webpage
 */
async function extractProductName(url, context) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    
    const html = await response.text();
    
    // Try to find product name in common patterns
    const patterns = [
      /<h1[^>]*class="[^"]*product[^"]*"[^>]*>([^<]+)</i,
      /<h1[^>]*id="[^"]*title[^"]*"[^>]*>([^<]+)</i,
      /<span[^>]*id="productTitle"[^>]*>([^<]+)</i,
      /<h1[^>]*data-automation="product-title"[^>]*>([^<]+)</i,
      /<title>([^<|–-]+)/i,
      /<meta\s+property="og:title"\s+content="([^"]+)"/i,
      /<meta\s+name="og:title"\s+content="([^"]+)"/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();
        // Clean up common suffixes
        name = name.replace(/\s*[-|]\s*(Amazon|Walmart|Target|Best Buy|Apple).*$/i, '').trim();
        name = name.replace(/\s*[-|]\s*Buy.*$/i, '').trim();
        if (name.length > 5 && name.length < 200) {
          return name;
        }
      }
    }
    
    return null;
  } catch (error) {
    context.log.error('Extract name error:', error.message);
    return null;
  }
}

/**
 * Search for product across multiple stores
 */
async function searchAllStores(query, context) {
  const results = [];
  
  // Clean up query for search
  const cleanQuery = encodeURIComponent(query.substring(0, 100));
  
  const stores = [
    {
      name: 'Amazon',
      searchUrl: `https://www.amazon.com/s?k=${cleanQuery}`,
      icon: '📦'
    },
    {
      name: 'Walmart',
      searchUrl: `https://www.walmart.com/search?q=${cleanQuery}`,
      icon: '🏪'
    },
    {
      name: 'Target',
      searchUrl: `https://www.target.com/s?searchTerm=${cleanQuery}`,
      icon: '🎯'
    },
    {
      name: 'Best Buy',
      searchUrl: `https://www.bestbuy.com/site/searchpage.jsp?st=${cleanQuery}`,
      icon: '💻'
    },
    {
      name: 'eBay',
      searchUrl: `https://www.ebay.com/sch/i.html?_nkw=${cleanQuery}`,
      icon: '🛒'
    },
    {
      name: 'Costco',
      searchUrl: `https://www.costco.com/CatalogSearch?keyword=${cleanQuery}`,
      icon: '📦'
    },
    {
      name: "Macy's",
      searchUrl: `https://www.macys.com/shop/featured/${cleanQuery}`,
      icon: '👔'
    },
    {
      name: 'Nordstrom',
      searchUrl: `https://www.nordstrom.com/sr?keyword=${cleanQuery}`,
      icon: '👗'
    },
    {
      name: 'Sephora',
      searchUrl: `https://www.sephora.com/search?keyword=${cleanQuery}`,
      icon: '💄'
    },
    {
      name: 'Home Depot',
      searchUrl: `https://www.homedepot.com/s/${cleanQuery}`,
      icon: '🔨'
    },
    {
      name: "Lowe's",
      searchUrl: `https://www.lowes.com/search?searchTerm=${cleanQuery}`,
      icon: '🔧'
    },
    {
      name: 'Newegg',
      searchUrl: `https://www.newegg.com/p/pl?d=${cleanQuery}`,
      icon: '🖥️'
    }
  ];
  
  // Return search URLs for each store
  // User can click to search and find the exact product page
  for (const store of stores) {
    results.push({
      store: store.name,
      icon: store.icon,
      searchUrl: store.searchUrl,
      description: `Search ${store.name} for "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`
    });
  }
  
  return results;
}
