/**
 * server.js — Dashboard Diretoria L — Cupons VTEX
 * Servidor dedicado para acompanhamento de cupons via API VTEX OMS.
 *
 * Porta: 3005 (configurável via .env PORT=)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const vtexSync = require('./vtexSync');

const app  = express();
const PORT = process.env.PORT || 3005;

// Cadastro de Filiais (Coordenadores, Distritais e Localização Geográfica)
const CADASTRO_PATH = path.join(__dirname, 'filiais_cadastro.json');
let filiaisCadastro = {};
const lookupCache = new Map();
const canonKeysMap = new Map();
const cityNumKeysMap = new Map();

function buildLookupIndexes() {
  lookupCache.clear();
  canonKeysMap.clear();
  cityNumKeysMap.clear();

  for (const key of Object.keys(filiaisCadastro)) {
    const normKey = normalizeStoreName(key);
    const canonKey = canonicalize(normKey);
    canonKeysMap.set(canonKey, key);

    const item = filiaisCadastro[key];
    if (item && item.municipio) {
      const normCity = normalizeStoreName(item.municipio);
      const numMatch = key.match(/\b(\d+)\b/);
      const num = numMatch ? numMatch[1] : '';
      const cityKey = (normCity + ' ' + num).trim();
      cityNumKeysMap.set(cityKey, key);
    }
  }
}

function loadFiliaisCadastro() {
  if (fs.existsSync(CADASTRO_PATH)) {
    try {
      filiaisCadastro = JSON.parse(fs.readFileSync(CADASTRO_PATH, 'utf8'));
      buildLookupIndexes();
      console.log(`ℹ️ [cadastro] carregado com ${Object.keys(filiaisCadastro).length} filiais da Diretoria L.`);
    } catch (err) {
      console.error(`❌ Erro ao ler filiais_cadastro.json:`, err.message);
    }
  }
}

// ── Mapeamento Fuzzy para Associação com a VTEX ────────────────────────────────
function normalizeStoreName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREVIATION_MAP = {
  'baln': 'balneario',
  'bal': 'balneario',
  'floripa': 'florianopolis',
  'sta': 'santa',
  'sto': 'santo',
  'eng': 'engenheiro',
  'mal': 'marechal',
  'dioni': 'dionisio',
  'cnel': 'coronel',
  'fco': 'francisco',
  'franc': 'francisco',
  'gal': 'galeria',
  'hosp': 'hospital',
  'louren': 'lourenco',
  'terez': 'terezinha',
  'ant': 'antonio',
  's': 'sao',
};

const CITY_SUFFIX_MAP = {
  'sapucaia': 'sapucaia sul',
  'venancio': 'venancio aires',
  'rosario': 'rosario do sul',
  'cachoeira': 'cachoeira do sul',
  'sao lourenco do sul': 'sao lourenco',
  'sao lourenco oeste': 'sao lourenco do oeste',
  'sao sebastiao cai': 'sao sebastiao',
  'julio castilhos': 'julio de castilhos',
  'quedas iguacu': 'quedas do iguacu',
  'cruzeiro oeste': 'cruzeiro do oeste',
  'sao miguel iguacu': 'sao miguel do iguacu',
  'encruzilhada sul': 'encruzilhada do sul',
  'cerro grande sul': 'cerro grande',
  'cerro grande do sul': 'cerro grande',
  'sao miguel oeste': 'sao miguel do oeste',
  'bela vista paraiso': 'bela vista do paraiso',
  'balneario arroio silva': 'balneario arroio do silva',
  'sao pedro sul': 'sao pedro do sul',
};

const SPECIAL_VTEX_TO_CSV = {
  'farmacias sao joao delivery': 'porto alegre dark store',
  'pf': 'pf matriz',
  'pf matriz': 'pf matriz',
  'pf modelo': 'pf loja modelo',
  'pf uruguai': 'pf uruguai',
  'pf shopping bella': 'pf shopping',
  'pf general netto': 'pf general neto',
  'gruarapuava': 'guarapuava',
  'santo amaro': 'santo amaro imperatriz',
  'sao francisco paula': 'sao fran paula',
  'sao francisco de paula': 'sao fran paula',
  'santa terezinha de itaipu': 'santa terezinha do itaipu',
  'santa terezinha itaipu': 'santa terezinha do itaipu',
  'santo antonio missoes': 'santo antonio das missoes',
  'caxias 21': 'caxias 20',
  'sjdigital1601': 'santo antonio das missoes',
};

function canonicalize(normName) {
  let res = String(normName).toLowerCase();
  if (SPECIAL_VTEX_TO_CSV[res] && SPECIAL_VTEX_TO_CSV[res] !== res) {
    return canonicalize(SPECIAL_VTEX_TO_CSV[res]);
  }
  res = res.replace(/([a-z])(\d)/g, '$1 $2');
  res = res.replace(/\b0+(\d+)\b/g, '$1');
  res = res.replace(/\s+(rs|pr|sc)\s*$/g, '');
  res = res.replace(/\s+(rs|pr|sc)\s+(\d)/g, ' $2');
  res = res
    .replace(/\s*-\s*(nova|shop|gal|hosp|merc|pr|sc|rs)\b/gi, '')
    .replace(/\b(nova|shop|gal|hosp|merc)\b/gi, '')
    .replace(/\bnv\b/g, '')
    .replace(/\bnov\b/g, '')
    .replace(/\b1nov\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = res.split(' ');
  const expanded = words.map(w => ABBREVIATION_MAP[w] || w);
  res = expanded.join(' ');
  res = res.replace(/d\s+/g, 'd').replace(/d'/g, 'd');

  const numberMatch = res.match(/^(.+?)\s+(\d+)$/);
  if (numberMatch) {
    const baseName = numberMatch[1].trim();
    const num = numberMatch[2];
    if (CITY_SUFFIX_MAP[baseName]) {
      res = CITY_SUFFIX_MAP[baseName] + ' ' + num;
    }
  } else {
    if (CITY_SUFFIX_MAP[res]) {
      res = CITY_SUFFIX_MAP[res];
    }
  }

  const finalNumMatch = res.match(/^(.+?)\s+(\d+)$/);
  if (finalNumMatch) {
      const bName = finalNumMatch[1].trim();
      if (SPECIAL_VTEX_TO_CSV[bName] && SPECIAL_VTEX_TO_CSV[bName] !== bName) {
          res = SPECIAL_VTEX_TO_CSV[bName] + ' ' + finalNumMatch[2];
      }
  }

  if (SPECIAL_VTEX_TO_CSV[res] && SPECIAL_VTEX_TO_CSV[res] !== res) {
    return canonicalize(SPECIAL_VTEX_TO_CSV[res]);
  }
  return res.replace(/\s+/g, ' ').trim();
}

loadFiliaisCadastro();


function lookupStore(vtexCleanName) {
  if (!vtexCleanName) return null;
  if (lookupCache.has(vtexCleanName)) {
    return lookupCache.get(vtexCleanName);
  }

  const normName = normalizeStoreName(vtexCleanName);
  if (filiaisCadastro[normName]) {
    const res = { ...filiaisCadastro[normName], matchedKey: normName };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  
  const canon = canonicalize(normName);
  if (canonKeysMap.has(canon)) {
    const key = canonKeysMap.get(canon);
    const res = { ...filiaisCadastro[key], matchedKey: key };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  
  const numMatch = canon.match(/^(.+?)\s+(\d+)$/);
  if (numMatch) {
    const baseName = numMatch[1].trim();
    const num = numMatch[2];
    
    if (canonKeysMap.has(baseName)) {
      const key = canonKeysMap.get(baseName);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
    
    const cityKey = (baseName + ' ' + num).trim();
    if (cityNumKeysMap.has(cityKey)) {
      const key = cityNumKeysMap.get(cityKey);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
  } else {
    if (cityNumKeysMap.has(canon)) {
      const key = cityNumKeysMap.get(canon);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
  }
  
  lookupCache.set(vtexCleanName, null);
  return null;
}

app.use(cors());
app.use(express.json());

// ─── Rotas ─────────────────────────────────────────────────────────────────

app.get('/api/coupons', (req, res) => {
  try {
    const cache = vtexSync.getOrdersCache();
    const list = [];
    
    Object.values(cache).forEach(order => {
      // Filtra pedidos que têm cupom e que não estão cancelados
      if (order.coupon && order.status !== 'canceled') {
        const seller = order.sellers?.[0]?.name || '';
        // Limpa o nome do seller da VTEX (ex: "LOJA 123 - 88.212.113/0001-00 - 123" -> "LOJA 123")
        const cleanSeller = seller.includes(' - ') ? seller.split(' - ')[0].trim() : seller;
        const storeInfo = lookupStore(cleanSeller);
        
        // FILTRO: Apenas lojas da Diretoria L (que estão no cadastro)
        if (!storeInfo) return;
        
        let dateStr = '';
        let utcDateStr = '';
        if (order.creationDate) {
          const d = new Date(order.creationDate);
          utcDateStr = d.toISOString().slice(0, 10);
          const brt = new Date(d.getTime() - 3 * 3600000);
          dateStr = brt.toISOString().slice(0, 10);
        }

        list.push({
          orderId: order.orderId,
          date: dateStr,
          utcDate: utcDateStr,
          creationDate: order.creationDate || '',
          coupon: String(order.coupon).toUpperCase().trim(),
          value: order.value ? order.value / 100 : 0, // VTEX envia valor em centavos
          store: storeInfo.matchedKey || cleanSeller,
          coordenador: storeInfo.coordenador || '',
          distrital: storeInfo.distrital || '',
          municipio: storeInfo.municipio || '',
          uf: storeInfo.uf || ''
        });
      }
    });

    res.json({
      status: 'success',
      sync: vtexSync.getSyncState(),
      totalOrders: Object.keys(cache).length,
      data: list
    });
  } catch (err) {
    console.error('[/api/coupons] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    sync: vtexSync.getSyncState(),
    cached_orders: Object.keys(vtexSync.getOrdersCache()).length
  });
});

app.get('/api/vtex-debug', async (req, res) => {
  const key   = process.env.VTEX_APP_KEY;
  const token = process.env.VTEX_APP_TOKEN;
  const acct  = process.env.VTEX_ACCOUNT || 'sjdigital';
  const preview = (s) => s ? `${s.slice(0, 6)}...${s.slice(-4)} (${s.length} chars)` : 'NOT SET';

  if (!key || !token) {
    return res.json({
      status: 'missing_credentials',
      vtex_app_key:   preview(key),
      vtex_app_token: preview(token),
      fix: 'Configure VTEX_APP_KEY e VTEX_APP_TOKEN nas Environment Variables do Render.'
    });
  }

  try {
    const testUrl = `https://${acct}.vtexcommercestable.com.br/api/oms/pvt/orders?per_page=1&page=1`;
    const axios = require('axios');
    const result = await axios.get(testUrl, {
      headers: {
        'Accept': 'application/json',
        'X-VTEX-API-AppKey': key,
        'X-VTEX-API-AppToken': token,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    const vtexOrders = vtexSync.getOrdersCache();
    const orderValues = Object.values(vtexOrders);
    const withCoupon = orderValues.filter(o => o.coupon && o.status !== 'canceled');
    const matchedL = withCoupon.filter(o => {
      const seller = o.sellers?.[0]?.name || '';
      const cleanSeller = seller.includes(' - ') ? seller.split(' - ')[0].trim() : seller;
      return lookupStore(cleanSeller) !== null;
    });

    res.json({
      status:                result.status === 200 ? 'ok' : 'vtex_error',
      vtex_http_status:      result.status,
      vtex_response_snippet: JSON.stringify(result.data).slice(0, 500),
      vtex_account:          acct,
      vtex_app_key:          preview(key),
      vtex_app_token:        preview(token),
      cadastro_keys_count:   Object.keys(filiaisCadastro).length,
      cached_orders_count:   Object.keys(vtexOrders).length,
      orders_with_coupon:    withCoupon.length,
      orders_matched_l:      matchedL.length,
      sync_state:            vtexSync.getSyncState()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ─── Trigger manual de sync VTEX (força reprocessamento completo) ──────────────
app.post('/api/vtex-sync', async (req, res) => {
  const forceFull = req.query.full === 'true';
  res.json({ status: 'started', forceFull });
  vtexSync.syncVtexData(forceFull).catch(err =>
    console.error('[Manual Sync] Falhou:', err.message)
  );
});

// Servir arquivos estáticos do frontend React compilados (pasta dist)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  console.log(`🌐 Servindo frontend estático de: ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log(`⚠️ Pasta dist do frontend não encontrada. Rodando apenas em modo API.`);
}

app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard Diretoria L — Cupons VTEX — http://localhost:${PORT}`);

  // ─── Keep-alive: pinga o próprio servidor a cada 10 min ────────────────────
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const https = require('https');
    const PING_INTERVAL_MS = 10 * 60 * 1000;
    setInterval(() => {
      const url = `${RENDER_URL}/api/health`;
      https.get(url, (pingRes) => {
        console.log(`💓 Keep-alive ping → ${url} [${pingRes.statusCode}]`);
      }).on('error', (err) => {
        console.warn(`⚠️ Keep-alive falhou: ${err.message}`);
      });
    }, PING_INTERVAL_MS);
    console.log(`💓 Keep-alive ativo: pingando ${RENDER_URL}/api/health a cada 10 min`);
  }

  // Inicializa o sync de cupons em segundo plano após 5 segundos da inicialização
  setTimeout(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Startup Sync] Falhou:', err.message));
  }, 5000);

  // Executa o sync a cada 60 minutos
  setInterval(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Interval Sync] Falhou:', err.message));
  }, 60 * 60 * 1000);
});
