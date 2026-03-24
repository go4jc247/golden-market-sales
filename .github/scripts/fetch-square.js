/**
 * fetch-square.js
 * Runs in GitHub Actions — fetches sale items from Square Catalog API
 * and writes data.json for the sale page.
 *
 * Required GitHub Secrets:
 *   SQUARE_ACCESS_TOKEN  — your Square production access token
 *
 * Square setup assumption:
 *   Items are in a category whose name contains "% OFF" (e.g. "20% OFF", "Buy 1 Get 1").
 *   We fetch all catalog items and filter by those categories.
 */

const fs = require('fs');
const https = require('https');

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SQUARE_ACCESS_TOKEN');
  process.exit(1);
}

const SQUARE_API = 'connect.squareup.com';

function squareGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SQUARE_API,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Paginate through all catalog objects of a given type
async function listCatalog(types) {
  let objects = [];
  let cursor = null;
  do {
    const qs = `?types=${types}${cursor ? `&cursor=${cursor}` : ''}`;
    const data = await squareGet(`/v2/catalog/list${qs}`);
    if (data.objects) objects = objects.concat(data.objects);
    cursor = data.cursor || null;
  } while (cursor);
  return objects;
}

async function main() {
  console.log('Fetching Square catalog…');

  const [items, categories] = await Promise.all([
    listCatalog('ITEM'),
    listCatalog('CATEGORY')
  ]);

  console.log(`Found ${items.length} items, ${categories.length} categories`);

  // Build category lookup  id → name
  const catMap = {};
  for (const cat of categories) {
    catMap[cat.id] = cat.category_data?.name || '';
  }

  // Find sale category IDs — any category whose name contains "% off" (case-insensitive)
  const saleCatIds = new Set(
    Object.entries(catMap)
      .filter(([, name]) => /\d+\s*%\s*off/i.test(name))
      .map(([id]) => id)
  );

  if (saleCatIds.size === 0) {
    console.warn('No sale categories found. Check category names in Square.');
  }

  // Filter items that belong to a sale category
  const saleItems = items.filter(item => {
    const catId = item.item_data?.category_id;
    return catId && saleCatIds.has(catId);
  });

  console.log(`Found ${saleItems.length} sale items`);

  // Derive discount % from category name  e.g. "20% OFF" → 20
  function discountFromCat(catId) {
    const name = catMap[catId] || '';
    const match = name.match(/(\d+)\s*%/);
    return match ? parseInt(match[1]) : null;
  }

  // Map Square category names to our display categories
  const CATEGORY_SLUG_MAP = {
    produce: /produce|fruit|vegetable|veg/i,
    meat: /meat|seafood|fish|poultry|chicken|beef|pork/i,
    dairy: /dairy|milk|cheese|egg/i,
    bakery: /bakery|bread|baked/i,
    frozen: /frozen/i,
    pantry: /pantry|dry|canned|can|sauce|condiment/i
  };

  function guessCategory(itemName, squareCatName) {
    for (const [slug, re] of Object.entries(CATEGORY_SLUG_MAP)) {
      if (re.test(itemName) || re.test(squareCatName)) return slug;
    }
    return 'pantry';
  }

  // Build items array for data.json
  const outputItems = saleItems.map((item, idx) => {
    const data = item.item_data || {};
    const variation = data.variations?.[0]?.item_variation_data;
    const originalPriceCents = variation?.price_money?.amount || 0;
    const catId = data.category_id;
    const discount = discountFromCat(catId);
    const salePriceCents = discount
      ? Math.round(originalPriceCents * (1 - discount / 100))
      : originalPriceCents;

    const squareCatName = catMap[catId] || '';
    const category = guessCategory(data.name || '', squareCatName);

    // Pull first image if available
    const imageId = data.image_ids?.[0];

    return {
      id: item.id,
      name: data.name || 'Unnamed Item',
      description: data.description || variation?.name || '',
      category,
      original_price: parseFloat((originalPriceCents / 100).toFixed(2)),
      sale_price: parseFloat((salePriceCents / 100).toFixed(2)),
      unit: 'each',
      color: '#2d6a4f',
      emoji: '🛒',
      featured: idx < 4,               // first 4 items featured
      image_id: imageId || null,
      image_url: null                   // fetched below
    };
  });

  // Fetch image URLs for items that have one
  const imageIds = [...new Set(outputItems.map(i => i.image_id).filter(Boolean))];
  if (imageIds.length > 0) {
    console.log(`Fetching ${imageIds.length} images…`);
    const imageMap = {};
    // Batch in groups of 100
    for (let i = 0; i < imageIds.length; i += 100) {
      const batch = imageIds.slice(i, i + 100);
      const qs = batch.map(id => `object_ids[]=${id}`).join('&');
      const res = await squareGet(`/v2/catalog/batch-retrieve?${qs}`);
      if (res.objects) {
        for (const obj of res.objects) {
          if (obj.type === 'IMAGE') {
            imageMap[obj.id] = obj.image_data?.url || null;
          }
        }
      }
    }
    for (const item of outputItems) {
      if (item.image_id && imageMap[item.image_id]) {
        item.image_url = imageMap[item.image_id];
      }
    }
  }

  // Load existing data.json to preserve store info
  let existingData = {};
  try {
    existingData = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  } catch (_) {}

  const output = {
    store: existingData.store || {},
    categories: existingData.categories || [],
    items: outputItems
  };

  output.store.updated = new Date().toISOString();

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log(`data.json written with ${outputItems.length} sale items.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
