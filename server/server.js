/**
 * server.js — Dashboard Diretoria L (Laerti Siqueira)
 * Processa a base de dados em CSV/Excel (metas e desempenho de vendas)
 * e integra o acompanhamento em tempo real de cupons VTEX OMS.
 *
 * Porta: 3005 (configurável via .env PORT=)
 * Arquivo padrão: ../base_dashboard.csv ou ../base Dashboard.xlsx
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const readline = require('readline');
const multer  = require('multer');
const { Storage } = require('@google-cloud/storage');
const vtexSync = require('./vtexSync');

const app  = express();
const PORT = process.env.PORT || 3005;

// Caminhos padrão locais (CSV para leitura em tempo de execução)
const CSV_NAME   = 'base_dashboard.csv';
const localOneUpCSV = path.join(__dirname, '..', CSV_NAME);
const localTwoUpCSV = path.join(__dirname, '..', '..', CSV_NAME);
const DEFAULT_CSV = fs.existsSync(localOneUpCSV) ? localOneUpCSV : localTwoUpCSV;
const CSV_PATH    = process.env.CSV_PATH || DEFAULT_CSV;

const localOneUp = path.join(__dirname, '..', 'base Dashboard.xlsx');
const localTwoUp = path.join(__dirname, '..', '..', 'base Dashboard.xlsx');
const DEFAULT_EXCEL = fs.existsSync(localOneUp) ? localOneUp : localTwoUp;
const EXCEL_PATH    = process.env.EXCEL_PATH || DEFAULT_EXCEL;

// Cadastro de Filiais (Coordenadores, Distritais e Localização Geográfica da Diretoria L)
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

// Configuração Google Cloud Storage (GCS)
const GCS_BUCKET = process.env.GCS_BUCKET;
const FILE_NAME  = 'base_dashboard.csv';
let storageClient = null;

if (GCS_BUCKET) {
  const saKeyPath = 'C:\\Users\\lucas.alves6\\Downloads\\ga-fsj-c165e892c46a.json';
  if (fs.existsSync(saKeyPath)) {
    storageClient = new Storage({ keyFilename: saKeyPath });
  } else {
    storageClient = new Storage();
  }
  console.log(`☁️ GCS configurado: bucket = ${GCS_BUCKET}`);
}

app.use(cors());
app.use(express.json());

// ─── Helpers ───────────────────────────────────────────────────────────────
function safe(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function round2(v) { return Math.round(v * 100) / 100; }
function pct(val, base)   { return base ? round2((val / base) * 100) : 0; }
function varP(cur, prev)  { return prev ? round2(((cur - prev) / prev) * 100) : 0; }

async function downloadFromGCS(destPath, gcsFileName) {
  if (!storageClient || !GCS_BUCKET) return false;
  const fileName = gcsFileName || FILE_NAME;
  try {
    const bucket = storageClient.bucket(GCS_BUCKET);
    const file = bucket.file(fileName);
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`⚠️ Planilha ${fileName} não encontrada no bucket GCS. Usando fallback local.`);
      return false;
    }
    await file.download({ destination: destPath });
    console.log(`☁️ Planilha ${fileName} baixada do GCS com sucesso.`);
    return true;
  } catch (err) {
    console.error(`❌ Erro ao baixar planilha do GCS:`, err.message);
    return false;
  }
}

// Globais para armazenamento compacto em TypedArrays
let stringPool = [];
let stringMap = new Map();
let recordsCount = 0;
let idMatrix = null;
let valMatrix = null;
let coordsCache = {};

function getStrId(str) {
  if (str === undefined || str === null) return -1;
  const s = String(str).trim();
  let id = stringMap.get(s);
  if (id === undefined) {
    id = stringPool.length;
    stringPool.push(s);
    stringMap.set(s, id);
  }
  return id;
}

function getStrVal(id) {
  if (id === -1 || id === undefined || id === null) return '';
  return stringPool[id] || '';
}

// ─── Leitura por Stream de CSV (Usa quase 0 de RAM e é 15x mais rápido) ────
async function readCSVAsync(filePath) {
  return new Promise((resolve, reject) => {
    const tempRecords = [];
    const fileStream = fs.createReadStream(filePath, 'utf8');
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let header = null;
    let C = {};

    rl.on('line', (line) => {
      const row = line.split(';');
      if (!header) {
        header = row.map(val => val.trim().replace(/^"|"$/g, ''));
        
        function findColIndex(predicate, fallbackIndex) {
          const i = header.findIndex(predicate);
          return i >= 0 ? i : fallbackIndex;
        }

        const distIndex = findColIndex(h => /distrital/i.test(h), -1);
        const coordIndex = findColIndex(h => /coordenador/i.test(h), -1);
        const filialIndex = findColIndex(h => /desc_filial|filial/i.test(h), 3);
        const grupoIndex = findColIndex(h => /desc_grupo|grupo/i.test(h), 4);
        const linhaIndex = findColIndex(h => /desc_linha|linha/i.test(h), 5);
        const metaParcIndex = findColIndex(h => /meta\s+parcial/i.test(h), 7);
        const metaTotIndex = findColIndex(h => /^meta\s+(?!parcial)/i.test(h), 6);
        const metaTotHeader = header[metaTotIndex] || '';
        const currentMonth = metaTotHeader.replace(/^meta\s+/i, '').trim();
        const monthRegex = currentMonth ? new RegExp(currentMonth, 'i') : /julho/i;

        const vJul26Index = findColIndex(h => /venda/i.test(h) && monthRegex.test(h) && /(26|2026)$/.test(h), 8);
        const vJul25Index = findColIndex(h => /venda/i.test(h) && monthRegex.test(h) && /(25|2025)$/.test(h), 9);
        const vJun26Index = findColIndex(h => /venda/i.test(h) && !monthRegex.test(h) && /(26|2026)$/.test(h), 10);
        const beJul26Index = findColIndex(h => /base\s+empresa/i.test(h) && monthRegex.test(h) && /(26|2026)$/.test(h), 11);
        const beJul25Index = findColIndex(h => /base\s+empresa/i.test(h) && monthRegex.test(h) && /(25|2025)$/.test(h), 12);

        C = {
          dist:      distIndex,
          coord:     coordIndex,
          filial:    filialIndex,
          grupo:     grupoIndex,
          linha:     linhaIndex,
          metaTot:   metaTotIndex,
          metaParc:  metaParcIndex,
          vJul26:    vJul26Index,
          vJul25:    vJul25Index,
          vJun26:    vJun26Index,
          beJul26:   beJul26Index,
          beJul25:   beJul25Index,
          labelJul26: String(header[vJul26Index] || 'Julho/26').replace('Venda Parcial ', ''),
          labelJun26: String(header[vJun26Index] || 'Junho/26').replace('Venda Parcial ', '')
        };
        return;
      }

      const getVal = (idx) => {
        if (idx < 0 || idx == null) return null;
        const val = row[idx];
        return val != null ? val.replace(/^"|"$/g, '') : null;
      };

      const filialName = String(getVal(C.filial) || '').trim();
      if (!filialName) return;

      const cadastro = filiaisCadastro[filialName] || {};
      const distVal = (C.dist >= 0 ? String(getVal(C.dist) || '').trim() : '') || cadastro.distrital || '';
      const coordVal = (C.coord >= 0 ? String(getVal(C.coord) || '').trim() : '') || cadastro.coordenador || '';

      if (!distVal || !coordVal || distVal.toLowerCase().includes('total') || filialName.toLowerCase().includes('total') || filialName.toLowerCase().includes('geral')) {
        return;
      }

      const filialId = getStrId(filialName);
      if (cadastro.coords && !coordsCache[filialId]) {
        coordsCache[filialId] = cadastro.coords;
      }

      const grupoVal = String(getVal(C.grupo) || '').trim();
      const linhaVal = String(getVal(C.linha) || '').trim();

      tempRecords.push({
        distId:     getStrId(distVal),
        coordId:    getStrId(coordVal),
        filialId,
        grupoId:    getStrId(grupoVal),
        subgrupoId: -1,
        linhaId:    getStrId(linhaVal),
        ufId:       getStrId(cadastro.uf || ''),
        munId:      getStrId(cadastro.municipio || ''),
        mt:         safe(getVal(C.metaTot)),
        mp:         safe(getVal(C.metaParc)),
        v26:        safe(getVal(C.vJul26)),
        v25:        safe(getVal(C.vJul25)),
        jun:        safe(getVal(C.vJun26)),
        be26:       safe(getVal(C.beJul26)),
        be25:       safe(getVal(C.beJul25)),
        c26:        0,
        c25:        0,
        cJun:       0
      });
    });

    rl.on('close', () => {
      recordsCount = tempRecords.length;
      idMatrix = new Int32Array(recordsCount * 8);
      valMatrix = new Float64Array(recordsCount * 10);

      for (let i = 0; i < recordsCount; i++) {
        const r = tempRecords[i];
        const baseIdx = i * 8;
        const baseValIdx = i * 10;

        idMatrix[baseIdx + 0] = r.distId;
        idMatrix[baseIdx + 1] = r.coordId;
        idMatrix[baseIdx + 2] = r.filialId;
        idMatrix[baseIdx + 3] = r.grupoId;
        idMatrix[baseIdx + 4] = r.subgrupoId;
        idMatrix[baseIdx + 5] = r.linhaId;
        idMatrix[baseIdx + 6] = r.ufId;
        idMatrix[baseIdx + 7] = r.munId;

        valMatrix[baseValIdx + 0] = r.mt;
        valMatrix[baseValIdx + 1] = r.mp;
        valMatrix[baseValIdx + 2] = r.v26;
        valMatrix[baseValIdx + 3] = r.v25;
        valMatrix[baseValIdx + 4] = r.jun;
        valMatrix[baseValIdx + 5] = r.be26;
        valMatrix[baseValIdx + 6] = r.be25;
        valMatrix[baseValIdx + 7] = 0;
        valMatrix[baseValIdx + 8] = 0;
        valMatrix[baseValIdx + 9] = 0;
      }

      resolve({
        label_mes_atual: C.labelJul26 || 'Julho/26',
        label_mes_ant:   C.labelJun26 || 'Junho/26',
        arquivo:         path.basename(filePath),
        lido_em:         new Date().toISOString()
      });
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

// ─── Agregação de registros ──────────────────────────────────────────────────
function aggregate(indices) {
  const dists     = {};
  const coordsAgg  = {};
  const grupos    = {};
  const linhas    = {};
  const filiais   = {};
  const cdDist    = {};
  const flCoord   = {};
  const flGeo     = {};
  
  let gt = { 
    mt:0, mp:0, v26:0, v25:0, jun:0, be26:0, be25:0,
    v26_eb:0, be26_eb:0, v25_eb:0, be25_eb:0,
    c26:0, c25:0, cJun:0
  };

  function add(map, key) {
    if (!map[key]) {
      map[key] = { 
        mt:0, mp:0, v26:0, v25:0, jun:0, be26:0, be25:0,
        v26_eb:0, be26_eb:0, v25_eb:0, be25_eb:0,
        c26:0, c25:0, cJun:0
      };
    }
    return map[key];
  }

  const count = indices ? indices.length : recordsCount;
  for (let idx = 0; idx < count; idx++) {
    const i = indices ? indices[idx] : idx;
    const baseIdx = i * 8;
    const baseValIdx = i * 10;
    
    const distId     = idMatrix[baseIdx + 0];
    const coordId    = idMatrix[baseIdx + 1];
    const filialId   = idMatrix[baseIdx + 2];
    const grupoId    = idMatrix[baseIdx + 3];
    const subgrupoId = idMatrix[baseIdx + 4];
    const linhaId    = idMatrix[baseIdx + 5];
    const ufId       = idMatrix[baseIdx + 6];
    const munId      = idMatrix[baseIdx + 7];
    
    const mt   = valMatrix[baseValIdx + 0];
    const mp   = valMatrix[baseValIdx + 1];
    const v26  = valMatrix[baseValIdx + 2];
    const v25  = valMatrix[baseValIdx + 3];
    const jun  = valMatrix[baseValIdx + 4];
    const be26 = valMatrix[baseValIdx + 5];
    const be25 = valMatrix[baseValIdx + 6];

    gt.mt  += mt;
    gt.mp  += mp;
    gt.v26 += v26;
    gt.v25 += v25;
    gt.jun += jun;
    gt.be26+= be26;
    gt.be25+= be25;

    if (be26 > 0) {
      gt.v26_eb  += v26;
      gt.be26_eb += be26;
    }
    if (be25 > 0) {
      gt.v25_eb  += v25;
      gt.be25_eb += be25;
    }

    if (distId !== -1) {
      const obj = add(dists, distId);
      obj.mt += mt; obj.mp += mp; obj.v26 += v26; obj.v25 += v25; obj.jun += jun; obj.be26 += be26; obj.be25 += be25;
      if (be26 > 0) { obj.v26_eb += v26; obj.be26_eb += be26; }
      if (be25 > 0) { obj.v25_eb += v25; obj.be25_eb += be25; }
    }

    if (coordId !== -1) {
      const obj = add(coordsAgg, coordId);
      obj.mt += mt; obj.mp += mp; obj.v26 += v26; obj.v25 += v25; obj.jun += jun; obj.be26 += be26; obj.be25 += be25;
      if (be26 > 0) { obj.v26_eb += v26; obj.be26_eb += be26; }
      if (be25 > 0) { obj.v25_eb += v25; obj.be25_eb += be25; }
      cdDist[coordId] = distId;
    }

    if (filialId !== -1) {
      const obj = add(filiais, filialId);
      obj.mt += mt; obj.mp += mp; obj.v26 += v26; obj.v25 += v25; obj.jun += jun; obj.be26 += be26; obj.be25 += be25;
      if (be26 > 0) { obj.v26_eb += v26; obj.be26_eb += be26; }
      if (be25 > 0) { obj.v25_eb += v25; obj.be25_eb += be25; }
      flCoord[filialId] = coordId;
      if (!flGeo[filialId]) {
        flGeo[filialId] = { uf: ufId, mun: munId };
      }
    }

    if (grupoId !== -1) {
      const obj = add(grupos, grupoId);
      obj.mt += mt; obj.mp += mp; obj.v26 += v26; obj.v25 += v25; obj.jun += jun; obj.be26 += be26; obj.be25 += be25;
      if (be26 > 0) { obj.v26_eb += v26; obj.be26_eb += be26; }
      if (be25 > 0) { obj.v25_eb += v25; obj.be25_eb += be25; }
    }

    if (linhaId !== -1) {
      const key = `${grupoId}||${linhaId}`;
      const obj = add(linhas, key);
      obj.mt += mt; obj.mp += mp; obj.v26 += v26; obj.v25 += v25; obj.jun += jun; obj.be26 += be26; obj.be25 += be25;
      if (be26 > 0) { obj.v26_eb += v26; obj.be26_eb += be26; }
      if (be25 > 0) { obj.v25_eb += v25; obj.be25_eb += be25; }
    }
  }

  function m(v) {
    return {
      meta_total:       round2(v.mt),
      meta_parcial:     round2(v.mp),
      venda_jul26:     round2(v.v26),
      venda_jul25:     round2(v.v25),
      venda_jun26:     round2(v.jun),
      base_emp_jul26:  round2(v.be26),
      base_emp_jul25:  round2(v.be25),
      pct_meta_total:   pct(v.v26, v.mt),
      pct_meta_parcial: pct(v.v26, v.mp),
      evol_yoy:         varP(v.v26, v.v25),
      evol_mom:         varP(v.v26, v.jun),
      pct_ecomm_jul26:  pct(v.v26_eb, v.be26_eb),
      pct_ecomm_jul25:  pct(v.v25_eb, v.be25_eb),
    };
  }

  return {
    total: m(gt),
    distritoriais: Object.entries(dists)
      .map(([idStr, v]) => ({
        nome: getStrVal(Number(idStr)), ...m(v),
      }))
      .filter(d => d.nome && d.nome.trim() !== ''),
    coordenadores: Object.entries(coordsAgg)
      .map(([idStr, v]) => ({
        nome: getStrVal(Number(idStr)), 
        distrital: getStrVal(cdDist[Number(idStr)]), 
        ...m(v),
      }))
      .filter(c => c.nome && c.nome.trim() !== ''),
    filiais: Object.entries(filiais)
      .map(([idStr, v]) => {
        const fid = Number(idStr);
        return {
          nome: getStrVal(fid), 
          coordenador: getStrVal(flCoord[fid]), 
          uf: getStrVal(flGeo[fid]?.uf),
          municipio: getStrVal(flGeo[fid]?.mun),
          coords: coordsCache[fid] || null,
          ...m(v),
        };
      })
      .filter(f => f.nome && f.nome.trim() !== ''),
    grupos: Object.entries(grupos)
      .map(([idStr, v]) => {
        const gStr = getStrVal(Number(idStr));
        return {
          nome: gStr.replace(/\(\d+\)$/, '').trim(),
          nomeOriginal: gStr,
          ...m(v),
        };
      })
      .filter(g => g.nome && g.nome.trim() !== ''),
    linhas: Object.entries(linhas)
      .map(([key, v]) => {
        const parts = key.split('||');
        const gId = Number(parts[0]);
        const lId = Number(parts[1]);
        const gStr = getStrVal(gId);
        return {
          nome: getStrVal(lId),
          grupo: gStr.replace(/\(\d+\)$/, '').trim(),
          ...m(v),
        };
      })
      .filter(l => l.nome && l.nome.trim() !== ''),
  };
}

// ─── Cache em memória ───────────────────────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getCached() {
  const now = Date.now();
  if (cache.data && (now - cache.ts) < CACHE_TTL_MS) return cache.data;

  const tmp = path.join(require('os').tmpdir(), `dash_l_${Date.now()}.csv`);
  let loaded = false;
  if (GCS_BUCKET && storageClient) {
    loaded = await downloadFromGCS(tmp, CSV_NAME);
  }

  const csvFileToRead = loaded ? tmp : CSV_PATH;
  if (!fs.existsSync(csvFileToRead)) {
    console.warn(`⚠️ [getCached] CSV não encontrado em: ${csvFileToRead}. Aguardando upload do usuário.`);
    return null;
  }

  const meta = await readCSVAsync(csvFileToRead);

  if (loaded) {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  meta.globalAgg = aggregate();
  cache = { data: meta, ts: now };
  console.log(`[cache] dados brutos da Diretoria L carregados de ${path.basename(csvFileToRead)} às ${new Date().toLocaleTimeString('pt-BR')} — ${recordsCount} registros.`);
  return cache.data;
}

function clearCache() {
  stringPool = [];
  stringMap.clear();
  idMatrix = null;
  valMatrix = null;
  coordsCache = {};
  recordsCount = 0;
  cache = { data: null, ts: 0 };
}

// ─── Filtro pós-cache ───────────────────────────────────────────────────────
function getFilteredIndices(filters) {
  const { distrital, coordenador, filial, grupo, linha, uf, cidade } = filters;
  
  const getFilterIds = (val) => {
    if (!val || val === 'all') return null;
    const items = val.split(',');
    const ids = new Set();
    items.forEach(item => {
      if (stringMap.has(item)) {
        ids.add(stringMap.get(item));
      }
    });
    if (ids.size === 0) {
      ids.add(-9999);
    }
    return ids;
  };

  const distIds = getFilterIds(distrital);
  const coordIds = getFilterIds(coordenador);
  const filialIds = getFilterIds(filial);
  const linhaIds = getFilterIds(linha);
  const ufIds = getFilterIds(uf);
  const cidadeIds = getFilterIds(cidade);

  let matchingGrupoIds = null;
  if (grupo && grupo !== 'all') {
    matchingGrupoIds = new Set();
    const gruposSelected = grupo.split(',');
    const gruposSet = new Set(gruposSelected);
    for (let id = 0; id < stringPool.length; id++) {
      const gStr = stringPool[id];
      const cleanGStr = gStr.replace(/\(\d+\)$/, '').trim();
      if (gruposSet.has(cleanGStr)) {
        matchingGrupoIds.add(id);
      }
    }
    if (matchingGrupoIds.size === 0) {
      matchingGrupoIds.add(-9999);
    }
  }

  const indices = [];
  
  for (let i = 0; i < recordsCount; i++) {
    const baseIdx = i * 8;
    
    if (distIds && !distIds.has(idMatrix[baseIdx + 0])) continue;
    if (coordIds && !coordIds.has(idMatrix[baseIdx + 1])) continue;
    if (filialIds && !filialIds.has(idMatrix[baseIdx + 2])) continue;
    if (matchingGrupoIds !== null && !matchingGrupoIds.has(idMatrix[baseIdx + 3])) continue;
    if (linhaIds && !linhaIds.has(idMatrix[baseIdx + 5])) continue;
    if (ufIds && !ufIds.has(idMatrix[baseIdx + 6])) continue;
    if (cidadeIds && !cidadeIds.has(idMatrix[baseIdx + 7])) continue;
    
    indices.push(i);
  }
  
  return indices;
}

function applyFilters(full, filters) {
  const { distrital, coordenador, filial, grupo, linha, uf, cidade } = filters;

  const isAll = (!distrital || distrital === 'all') &&
                (!coordenador || coordenador === 'all') &&
                (!filial || filial === 'all') &&
                (!grupo || grupo === 'all') &&
                (!linha || linha === 'all') &&
                (!uf || uf === 'all') &&
                (!cidade || cidade === 'all');

  if (isAll && full.globalAgg) {
    return {
      total:          full.globalAgg.total,
      filtered_total: full.globalAgg.total,
      distritoriais:  full.globalAgg.distritoriais,
      coordenadores:  full.globalAgg.coordenadores,
      filiais:        full.globalAgg.filiais,
      grupos:         full.globalAgg.grupos,
      linhas:         full.globalAgg.linhas,
      label_mes_atual: full.label_mes_atual,
      label_mes_ant:   full.label_mes_ant,
      arquivo:         full.arquivo,
      lido_em:         full.lido_em,
    };
  }

  const indices = getFilteredIndices(filters);
  const filteredAgg = aggregate(indices);

  return {
    total:          full.globalAgg.total,
    filtered_total: filteredAgg.total,
    distritoriais:  filteredAgg.distritoriais,
    coordenadores:  filteredAgg.coordenadores,
    filiais:        filteredAgg.filiais,
    grupos:         filteredAgg.grupos,
    linhas:         filteredAgg.linhas,
    label_mes_atual: full.label_mes_atual,
    label_mes_ant:   full.label_mes_ant,
    arquivo:         full.arquivo,
    lido_em:         full.lido_em,
  };
}

// ─── Rotas ─────────────────────────────────────────────────────────────────
const upload = multer({ 
  dest: require('os').tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 }
});
const uploadSingle = upload.single('file');
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'sjdigital';

app.post('/api/upload', (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      console.error('[/api/upload] Erro no multer:', err.message || err);
      return res.status(400).json({ status: 'error', error: `Erro no upload do arquivo: ${err.message || 'Falha na transferência'}` });
    }
    next();
  });
}, async (req, res) => {
  try {
    clearCache();
    if (global.gc) { try { global.gc(); } catch (_) {} }

    const token = req.body.token;
    if (token !== UPLOAD_TOKEN) {
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(401).json({ status: 'error', error: 'Senha incorreta para upload.' });
    }

    if (!req.file) {
      return res.status(400).json({ status: 'error', error: 'Nenhum arquivo enviado.' });
    }

    const localTempPath = req.file.path;

    try {
      const firstLine = await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(localTempPath, { encoding: 'utf8', start: 0, end: 1024 });
        let buffer = '';
        stream.on('data', chunk => {
          buffer += chunk;
          const lf = buffer.indexOf('\n');
          if (lf >= 0) {
            resolve(buffer.substring(0, lf));
            stream.destroy();
          }
        });
        stream.on('end', () => resolve(buffer));
        stream.on('error', err => reject(err));
      });

      if (!firstLine || !firstLine.toLowerCase().includes('filial')) {
        throw new Error('O arquivo não parece conter um cabeçalho válido com a coluna "Filial" ou "Desc_Filial". Certifique-se de enviar a planilha correta.');
      }
    } catch (err) {
      try { fs.unlinkSync(localTempPath); } catch (_) {}
      return res.status(400).json({ status: 'error', error: `Validação do CSV falhou: ${err.message}` });
    }

    if (GCS_BUCKET && storageClient) {
      try {
        console.log(`☁️ Enviando CSV para o GCS gs://${GCS_BUCKET}/${FILE_NAME}...`);
        const bucket = storageClient.bucket(GCS_BUCKET);
        await bucket.upload(localTempPath, {
          destination: FILE_NAME,
          metadata: { cacheControl: 'no-cache' }
        });
        console.log(`☁️ CSV salvo no GCS.`);
      } catch (gcsErr) {
        try { fs.unlinkSync(localTempPath); } catch (_) {}
        throw new Error(`Erro ao salvar no Google Cloud Storage: ${gcsErr.message}`);
      }
    } else {
      console.log(`💾 Salvando CSV localmente em ${CSV_PATH}...`);
      fs.copyFileSync(localTempPath, CSV_PATH);
    }

    try { fs.unlinkSync(localTempPath); } catch (_) {}
    
    loadFiliaisCadastro();
    clearCache();
    if (global.gc) { try { global.gc(); } catch (_) {} }

    res.json({ status: 'ok', msg: 'Planilha atualizada com sucesso!' });
  } catch (err) {
    console.error('[/api/upload] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/metas', async (req, res) => {
  try {
    const full = await getCached();
    if (!full) {
      return res.json({ status: 'no_data', msg: 'Nenhuma planilha carregada. Faça o upload do arquivo base_dashboard.csv pelo portal.' });
    }
    const filters = {
      distrital:   req.query.distrital   || 'all',
      coordenador: req.query.coordenador || 'all',
      filial:      req.query.filial      || 'all',
      grupo:       req.query.grupo       || 'all',
      linha:       req.query.linha       || 'all',
      uf:          req.query.uf          || 'all',
      cidade:      req.query.cidade      || 'all',
    };
    const data = applyFilters(full, filters);

    const globalAgg = full.globalAgg;
    const options = {
      distritoriais: globalAgg.distritoriais.map(d => ({ nome: d.nome })),
      coordenadores: globalAgg.coordenadores.map(c => ({ nome: c.nome, distrital: c.distrital })),
      filiais: globalAgg.filiais.map(f => ({ nome: f.nome, coordenador: f.coordenador, uf: f.uf, municipio: f.municipio })),
      grupos: globalAgg.grupos.map(g => ({ nome: g.nome })),
      linhas: globalAgg.linhas.map(l => ({ nome: l.nome, grupo: l.grupo })),
      ufs: [...new Set(globalAgg.filiais.map(f => f.uf).filter(Boolean))].sort(),
      cidades: [...new Set(globalAgg.filiais.map(f => f.municipio).filter(Boolean))].sort()
    };

    res.json({ status: 'ok', data, filters, options, cache_age_ms: Date.now() - cache.ts });
  } catch (err) {
    console.error('[/api/metas] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  req.url = '/api/metas';
  app.handle(req, res);
});

app.get('/api/detalhes', async (req, res) => {
  try {
    const full = await getCached();
    if (!full) {
      return res.json({ status: 'no_data', msg: 'Nenhuma planilha carregada.' });
    }
    const filters = {
      distrital:   req.query.distrital   || 'all',
      coordenador: req.query.coordenador || 'all',
      filial:      req.query.filial      || 'all',
    };
    const data = applyFilters(full, filters);
    res.json({
      status:   'ok',
      grupos:   data.grupos,
      linhas:   data.linhas,
      filiais:  data.filiais,
      total:    data.grupos.reduce((s, g) => s + 1, 0),
      label_mes_atual: data.label_mes_atual,
      label_mes_ant:   data.label_mes_ant,
    });
  } catch (err) {
    console.error('[/api/detalhes] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/filtros', async (req, res) => {
  try {
    const full = await getCached();
    if (!full) {
      return res.json({ status: 'no_data', msg: 'Nenhuma planilha carregada.' });
    }
    const globalAgg = full.globalAgg;
    res.json({
      status:        'ok',
      distritoriais:  globalAgg.distritoriais.map(d => d.nome).sort(),
      coordenadores:  globalAgg.coordenadores.map(c => c.nome).sort(),
      filiais:        globalAgg.filiais.map(f => f.nome).sort(),
    });
  } catch (err) {
    console.error('[/api/filtros] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/filters', async (req, res) => {
  req.url = '/api/filtros';
  app.handle(req, res);
});

app.post('/api/refresh', async (req, res) => {
  loadFiliaisCadastro();
  clearCache();
  try {
    const full = await getCached();
    res.json({ status: 'ok', msg: 'Cache limpo e dados recarregados', rows: full.globalAgg.filiais.length });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/coupons', (req, res) => {
  try {
    const cache = vtexSync.getOrdersCache();
    const list = [];
    
    Object.values(cache).forEach(order => {
      if (order.coupon && order.status !== 'canceled') {
        const seller = order.sellers?.[0]?.name || '';
        const cleanSeller = seller.includes(' - ') ? seller.split(' - ')[0].trim() : seller;
        const storeInfo = lookupStore(cleanSeller);
        
        // FILTRO: Apenas lojas da Diretoria L
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
          value: order.value ? order.value / 100 : 0,
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
    status:        'ok',
    csv_path:      CSV_PATH,
    csv_exists:    fs.existsSync(CSV_PATH),
    port:          PORT,
    cache_age_ms:  cache.ts ? Date.now() - cache.ts : null,
    sync:          vtexSync.getSyncState(),
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
  console.log(`\n🚀 Dashboard Diretoria L (Laerte) — http://localhost:${PORT}`);
  console.log(`📊 CSV: ${CSV_PATH} (${fs.existsSync(CSV_PATH) ? '✅' : '❌'})\n`);

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

  setTimeout(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Startup Sync] Falhou:', err.message));
  }, 5000);

  setInterval(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Interval Sync] Falhou:', err.message));
  }, 60 * 60 * 1000);
});
