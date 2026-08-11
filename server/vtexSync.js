const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'vtex_orders_cache.json');

const account = process.env.VTEX_ACCOUNT || 'sjdigital';
const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
  'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const { Storage } = require('@google-cloud/storage');
const GCS_BUCKET = process.env.GCS_BUCKET;
let storageClient = null;

if (GCS_BUCKET) {
  const saKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'C:\\Users\\lucas.alves6\\Downloads\\ga-fsj-c165e892c46a.json';
  if (fs.existsSync(saKeyPath)) {
    storageClient = new Storage({ keyFilename: saKeyPath });
  } else {
    storageClient = new Storage();
  }
}

async function restoreCacheFromGCS() {
  if (!GCS_BUCKET || !storageClient || fs.existsSync(CACHE_FILE)) return;
  try {
    const bucket = storageClient.bucket(GCS_BUCKET);
    const file = bucket.file('vtex_orders_cache.json');
    const [exists] = await file.exists();
    if (exists) {
      console.log('☁️ [VTEX Sync] Baixando vtex_orders_cache.json do GCS...');
      await file.download({ destination: CACHE_FILE });
      console.log('☁️ [VTEX Sync] Cache do VTEX restaurado do GCS.');
    }
  } catch (err) {
    console.error('❌ [VTEX Sync] Erro ao restaurar cache do GCS:', err.message);
  }
}

async function backupCacheToGCS() {
  if (!GCS_BUCKET || !storageClient || !fs.existsSync(CACHE_FILE)) return;
  try {
    const bucket = storageClient.bucket(GCS_BUCKET);
    await bucket.upload(CACHE_FILE, {
      destination: 'vtex_orders_cache.json',
      metadata: { cacheControl: 'no-cache' }
    });
    console.log('☁️ [VTEX Sync] Cache vtex_orders_cache.json salvo no GCS com sucesso.');
  } catch (err) {
    console.error('❌ [VTEX Sync] Erro ao salvar backup do cache no GCS:', err.message);
  }
}

// Global sync state flag
let isSyncing = false;
let progressPercent = 0;
let lastSyncTime = null;
let ordersCache = null;

function loadOrdersCache() {
  if (ordersCache) return ordersCache;
  if (fs.existsSync(CACHE_FILE)) {
    try {
      ordersCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) || {};
      return ordersCache;
    } catch (e) {
      console.error('[VTEX Sync] Erro ao carregar cache de pedidos:', e.message);
    }
  }
  ordersCache = {};
  return ordersCache;
}

async function saveCacheAsync(cacheObj, filePath) {
  const tempPath = filePath + '.tmp';
  try {
    const json = JSON.stringify(cacheObj);
    await fs.promises.writeFile(tempPath, json, 'utf-8');
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    console.error('[VTEX Sync] Erro ao salvar cache de forma assíncrona:', err.message);
  }
}

function pruneCache(cache) {
  const utcOffset = -3;
  const getBrtDateStr = (daysAgo) => {
    const d = new Date(Date.now() - daysAgo * 24 * 3600000);
    const localDate = new Date(d.getTime() + (utcOffset * 3600000));
    return localDate.toISOString().slice(0, 10);
  };
  const keepDates = new Set();
  // Mantém os últimos 15 dias no cache
  for (let i = 0; i <= 15; i++) {
    keepDates.add(getBrtDateStr(i));
  }
  let count = 0;
  for (const id in cache) {
    const order = cache[id];
    if (order && order.creationDate) {
      const creation = new Date(order.creationDate);
      const localCreation = new Date(creation.getTime() + (utcOffset * 3600000));
      const brtDateStr = localCreation.toISOString().slice(0, 10);
      if (!keepDates.has(brtDateStr)) {
        delete cache[id];
        count++;
      }
    } else {
      delete cache[id];
      count++;
    }
  }
  if (count > 0) {
    console.log(`[VTEX Sync] Removidos ${count} pedidos antigos do cache.`);
  }
}

function minifyOrder(order) {
  if (!order) return null;
  return {
    orderId: order.orderId,
    status: order.status,
    creationDate: order.creationDate,
    value: order.value,
    sellers: (order.sellers || []).map(s => ({ id: s.id, name: s.name })),
    coupon: order.marketingData?.coupon || null,
    itemsCount: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)
  };
}

const getDayRange = (daysAgo, startFromIso = null) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const utcOffset = -3;
  const localDate = new Date(d.getTime() + (utcOffset * 3600000));
  const dateString = localDate.toISOString().slice(0, 10);
  const nextDay = new Date(localDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayString = nextDay.toISOString().slice(0, 10);

  if (startFromIso) {
    return [{
      start: startFromIso,
      end: `${nextDayString}T02:59:59Z`
    }];
  }

  // Divisão em 4 blocos de 6 horas para garantir performance
  return [
    { start: `${dateString}T03:00:00Z`, end: `${dateString}T08:59:59Z` },
    { start: `${dateString}T09:00:00Z`, end: `${dateString}T14:59:59Z` },
    { start: `${dateString}T15:00:00Z`, end: `${dateString}T20:59:59Z` },
    { start: `${dateString}T21:00:00Z`, end: `${nextDayString}T02:59:59Z` }
  ];
};

async function fetchOrderDetails(orderIds, cache) {
  const chunkSize = 30; // lote conservador para evitar limite de requisições do Render/VTEX
  const totalChunks = Math.ceil(orderIds.length / chunkSize);

  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunkIdx = Math.floor(i / chunkSize) + 1;
    progressPercent = Math.round((chunkIdx / totalChunks) * 100);
    
    if (chunkIdx % 10 === 0 || chunkIdx === 1 || chunkIdx === totalChunks) {
      console.log(`[VTEX Sync] Buscando detalhes de cupons: lote ${chunkIdx}/${totalChunks}...`);
    }
    
    const chunk = orderIds.slice(i, i + chunkSize);
    const promises = chunk.map(async id => {
      let retries = 3;
      let delay = 1000;
      while (retries > 0) {
        try {
          const res = await axios.get(
            `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${id}`,
            { headers, timeout: 15000 }
          );
          return res.data;
        } catch (err) {
          retries--;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, delay));
            delay += 1000;
          }
        }
      }
      return null;
    });

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null);
    for (const order of validResults) {
      const minified = minifyOrder(order);
      if (minified) {
        cache[minified.orderId] = minified;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

async function syncPeriod(daysAgo, cache) {
  let startFromIso = null;
  const utcOffset = -3;
  const targetBrt = new Date(Date.now() + utcOffset * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);
  const dayOnly = Object.values(cache).filter(o => {
    if (!o.creationDate) return false;
    const brt = new Date(new Date(o.creationDate).getTime() + utcOffset * 3600000);
    return brt.toISOString().slice(0, 10) === targetBrt;
  });
  
  // Sincronização incremental se já temos dados daquele dia no cache
  if (dayOnly.length > 0) {
    const latestMs = Math.max(...dayOnly.map(o => new Date(o.creationDate).getTime()));
    const fromMs = latestMs - 10 * 60 * 1000; // 10 min de overlap
    startFromIso = new Date(fromMs).toISOString().slice(0, 19) + 'Z';
    console.log(`[VTEX Sync] Sync incremental dia=${daysAgo} a partir de ${startFromIso}`);
  }

  const blocks = getDayRange(daysAgo, startFromIso);
  let allListItems = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 30) {
      try {
        const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${block.start} TO ${block.end}]&per_page=100&page=${page}`;
        const res = await axios.get(url, { headers, timeout: 20000 });
        const list = res.data.list || [];
        const paging = res.data.paging;

        if (list.length > 0) {
          allListItems.push(...list);
          
          // Atualiza status de pedidos que já estão no cache
          list.forEach(o => {
            if (cache[o.orderId]) {
              cache[o.orderId].status = o.status;
            }
          });

          if (paging && paging.pages && page >= paging.pages) {
            hasMore = false;
          }
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.error(`[VTEX Sync] Erro página ${page} bloco ${b+1} dia=${daysAgo}:`, e.message);
        hasMore = false;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const orderIds = Array.from(new Set(allListItems.map(o => o.orderId)));
  if (orderIds.length > 0) {
    const toFetch = orderIds.filter(id => {
      const cached = cache[id];
      if (!cached) return true;
      if (!cached.sellers || cached.sellers.length === 0) return true;
      return false;
    });

    if (toFetch.length > 0) {
      await fetchOrderDetails(toFetch, cache);
    }
  }
}

async function syncVtexData(forceFull = false) {
  if (!process.env.VTEX_APP_KEY || !process.env.VTEX_APP_TOKEN) {
    console.log('[VTEX Sync] Chaves da VTEX não configuradas. Sincronização ignorada.');
    return;
  }
  if (isSyncing) return;
  isSyncing = true;
  progressPercent = 0;
  console.log(`[VTEX Sync] Iniciando sincronização de cupons (forceFull=${forceFull})...`);
  
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  await restoreCacheFromGCS();
  const cache = loadOrdersCache();
  
  try {
    pruneCache(cache);
    // Sincroniza os últimos 15 dias no primeiro sync ou se forçado, senão apenas hoje e ontem
    const targetDays = (forceFull || !lastSyncTime) 
      ? Array.from({ length: 16 }, (_, i) => i) 
      : [0, 1];
      
    for (const d of targetDays) {
      console.log(`[VTEX Sync] Processando dia ${d}...`);
      await syncPeriod(d, cache);
      await saveCacheAsync(cache, CACHE_FILE);
    }
    pruneCache(cache);
    await saveCacheAsync(cache, CACHE_FILE);
    await backupCacheToGCS();
    lastSyncTime = new Date().toISOString();
    console.log(`[VTEX Sync] Sincronização concluída com sucesso às ${lastSyncTime}.`);
  } catch (err) {
    console.error('[VTEX Sync] Falha geral no sincronismo de cupons:', err.message);
  } finally {
    isSyncing = false;
    progressPercent = 100;
  }
}

module.exports = {
  syncVtexData,
  getSyncState: () => ({ isSyncing, progressPercent, lastSyncTime }),
  getOrdersCache: () => loadOrdersCache(),
  restoreCacheFromGCS,
  backupCacheToGCS
};
