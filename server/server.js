/**
 * server.js — Dashboard Diretoria L
 * Lê APENAS a aba BASE DASHBOARD do arquivo Excel.
 * Atualizar o Excel = atualizar o dashboard. Simples e rápido.
 *
 * Porta: 3005 (configurável via .env PORT=)
 * Arquivo padrão: ../ base Dashboard.xlsx
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

const app  = express();
const PORT = process.env.PORT || 3005;

// Caminhos padrão locais (Excel para upload/conversão, CSV para leitura em tempo de execução)
const CSV_NAME   = 'base_dashboard.csv';
const localOneUpCSV = path.join(__dirname, '..', CSV_NAME);
const localTwoUpCSV = path.join(__dirname, '..', '..', CSV_NAME);
const DEFAULT_CSV = fs.existsSync(localOneUpCSV) ? localOneUpCSV : localTwoUpCSV;
const CSV_PATH    = process.env.CSV_PATH || DEFAULT_CSV;

const localOneUp = path.join(__dirname, '..', 'base Dashboard.xlsx');
const localTwoUp = path.join(__dirname, '..', '..', 'base Dashboard.xlsx');
const DEFAULT_EXCEL = fs.existsSync(localOneUp) ? localOneUp : localTwoUp;
const EXCEL_PATH    = process.env.EXCEL_PATH || DEFAULT_EXCEL;

// Configuração Google Cloud Storage (GCS)
const GCS_BUCKET = process.env.GCS_BUCKET;
const FILE_NAME  = 'base_dashboard.csv'; // Salvamos apenas o CSV no GCS para leveza absoluta
let storageClient = null;

if (GCS_BUCKET) {
  // Localmente, tenta carregar o arquivo de credenciais da pasta Downloads se existir,
  // senão utiliza Application Default Credentials (ADC) em produção
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

// Função para baixar a planilha do GCS
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



// ─── Leitura por Stream de CSV (Usa quase 0 de RAM e é 15x mais rápido) ────
async function readCSVAsync(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const fileStream = fs.createReadStream(filePath, 'utf8');
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let header = null;
    let C = {};

    rl.on('line', (line) => {
      // Split básico por ponto e vírgula
      const row = line.split(';');
      if (!header) {
        header = row.map(val => val.trim().replace(/^"|"$/g, ''));
        
        function findColIndex(predicate, fallbackIndex) {
          const i = header.findIndex(predicate);
          return i >= 0 ? i : fallbackIndex;
        }

        const distIndex = findColIndex(h => /distrital/i.test(h), 1);
        const coordIndex = findColIndex(h => /coordenador/i.test(h), 2);
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

      const distValRaw = row[C.dist];
      if (distValRaw == null || distValRaw === '') return;

      const getVal = (idx) => {
        const val = row[idx];
        return val != null ? val.replace(/^"|"$/g, '') : null;
      };

      records.push({
        dist:   String(getVal(C.dist)   || '').trim(),
        coord:  String(getVal(C.coord)  || '').trim(),
        filial: String(getVal(C.filial) || '').trim(),
        grupo:  String(getVal(C.grupo)  || '').trim(),
        linha:  String(getVal(C.linha)  || '').trim(),
        mt:     safe(getVal(C.metaTot)),
        mp:     safe(getVal(C.metaParc)),
        v26:    safe(getVal(C.vJul26)),
        v25:    safe(getVal(C.vJul25)),
        jun:    safe(getVal(C.vJun26)),
        be26:   safe(getVal(C.beJul26)),
        be25:   safe(getVal(C.beJul25)),
      });
    });

    rl.on('close', () => {
      resolve({
        records,
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
function aggregate(records) {
  const dists    = {};
  const coords   = {};
  const grupos   = {};
  const linhas   = {};  // key = "grupo||linha" para manter relação
  const filiais  = {};
  const cdDist   = {};  // coordenador → distrital
  const flCoord  = {};  // filial → coordenador
  const lgMap    = {};  // linha → grupo (primeiro grupo encontrado)
  
  let gt = { 
    mt:0, mp:0, v26:0, v25:0, jun:0, be26:0, be25:0,
    v26_eb:0, be26_eb:0, v25_eb:0, be25_eb:0 
  };

  for (const r of records) {
    const { dist, coord, filial, grupo, linha, mt, mp, v26, v25, jun, be26, be25 } = r;

    function add(map, key) {
      if (!map[key]) {
        map[key] = { 
          mt:0, mp:0, v26:0, v25:0, jun:0, be26:0, be25:0,
          v26_eb:0, be26_eb:0, v25_eb:0, be25_eb:0 
        };
      }
      map[key].mt  += mt;
      map[key].mp  += mp;
      map[key].v26 += v26;
      map[key].v25 += v25;
      map[key].jun += jun;
      map[key].be26+= be26;
      map[key].be25+= be25;
      
      if (be26 > 0) {
        map[key].v26_eb  += v26;
        map[key].be26_eb += be26;
      }
      if (be25 > 0) {
        map[key].v25_eb  += v25;
        map[key].be25_eb += be25;
      }
    }

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

    if (dist)   { add(dists,   dist); }
    if (coord)  { add(coords,  coord); cdDist[coord] = dist; }
    if (filial) { add(filiais, filial); flCoord[filial] = coord; }
    if (grupo)  { add(grupos,  grupo); }
    // Agrupa linhas por grupo: chave composta para manter relação
    if (linha) {
      const linhaKey = grupo ? `${grupo}||${linha}` : linha;
      add(linhas, linhaKey);
      if (!lgMap[linhaKey]) lgMap[linhaKey] = grupo || '';
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
    distritoriais: Object.entries(dists).map(([nome, v]) => ({
      nome, ...m(v),
    })),
    coordenadores: Object.entries(coords).map(([nome, v]) => ({
      nome, distrital: cdDist[nome] || '', ...m(v),
    })),
    filiais: Object.entries(filiais).map(([nome, v]) => ({
      nome, coordenador: flCoord[nome] || '', ...m(v),
    })),
    grupos: Object.entries(grupos).map(([nomeOrig, v]) => ({
      nome:         nomeOrig.replace(/\(\d+\)$/, '').trim(),
      nomeOriginal: nomeOrig,
      ...m(v),
    })),
    linhas: Object.entries(linhas).map(([key, v]) => {
      const sep = key.indexOf('||');
      const grupoNome = sep >= 0 ? key.substring(0, sep).replace(/\(\d+\)$/, '').trim() : (lgMap[key] || '');
      const linhaName = sep >= 0 ? key.substring(sep + 2) : key;
      return {
        nome: linhaName,
        grupo: grupoNome,
        ...m(v),
      };
    }),
  };
}

// ─── Cache em memória ───────────────────────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas (ou até novo upload/refresh)

async function getCached() {
  const now = Date.now();
  if (cache.data && (now - cache.ts) < CACHE_TTL_MS) return cache.data;

  // Baixar do GCS ou ler local
  const tmp = path.join(require('os').tmpdir(), `dash_c_${Date.now()}.csv`);
  let loaded = false;
  if (GCS_BUCKET && storageClient) {
    loaded = await downloadFromGCS(tmp, CSV_NAME);
  }

  const csvFileToRead = loaded ? tmp : CSV_PATH;
  if (!fs.existsSync(csvFileToRead)) {
    // Não há dados carregados — retornar null para que as rotas mostrem tela de upload
    console.warn(`⚠️ [getCached] CSV não encontrado em: ${csvFileToRead}. Aguardando upload do usuário.`);
    return null;
  }

  const data = await readCSVAsync(csvFileToRead);

  if (loaded) {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  data.globalAgg = aggregate(data.records);
  cache = { data, ts: now };
  console.log(`[cache] dados brutos carregados de ${path.basename(csvFileToRead)} às ${new Date().toLocaleTimeString('pt-BR')} — ${data.records.length} registros`);
  return data;
}

function clearCache() { cache = { data: null, ts: 0 }; }

// ─── Filtro pós-cache ───────────────────────────────────────────────────────
function applyFilters(full, filters) {
  const { distrital, coordenador, filial, grupo, linha } = filters;

  const isAll = (!distrital || distrital === 'all') &&
                (!coordenador || coordenador === 'all') &&
                (!filial || filial === 'all') &&
                (!grupo || grupo === 'all') &&
                (!linha || linha === 'all');

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

  let records = full.records;

  // Filtragem sequencial
  if (distrital && distrital !== 'all') {
    records = records.filter(r => r.dist === distrital);
  }
  if (coordenador && coordenador !== 'all') {
    records = records.filter(r => r.coord === coordenador);
  }
  if (filial && filial !== 'all') {
    records = records.filter(r => r.filial === filial);
  }
  if (grupo && grupo !== 'all') {
    records = records.filter(r => r.grupo.replace(/\(\d+\)$/, '').trim() === grupo);
  }
  if (linha && linha !== 'all') {
    records = records.filter(r => r.linha === linha);
  }

  const globalAgg = full.globalAgg || aggregate(full.records);
  const filteredAgg = aggregate(records);

  return {
    total:          globalAgg.total,
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
  limits: { fileSize: 200 * 1024 * 1024 } // Limite de 200MB
});
const uploadSingle = upload.single('file');
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'sjcomercial';

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
    // Limpar cache em memória ANTES de processar o upload para liberar RAM
    // Isso evita pico de memória que derruba o processo Node.js (causando Erro HTTP 502 no proxy/load balancer)
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

    // O arquivo agora é enviado diretamente como CSV pré-processado pelo navegador!
    // Isso evita completamente o estouro de memória (OOM / Erro 502) no backend.
    // Vamos apenas validar se as colunas essenciais estão presentes no CSV.
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

      if (!firstLine || !firstLine.toLowerCase().includes('distrital')) {
        throw new Error('O arquivo não parece conter um cabeçalho válido com a coluna "Distrital". Certifique-se de enviar a planilha correta.');
      }
    } catch (err) {
      try { fs.unlinkSync(localTempPath); } catch (_) {}
      return res.status(400).json({ status: 'error', error: `Validação do CSV falhou: ${err.message}` });
    }

    // Salvar no GCS se configurado, ou substituir arquivo local
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

    // Limpar arquivo temporário
    try { fs.unlinkSync(localTempPath); } catch (_) {}
    
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
    };
    const data = applyFilters(full, filters);

    // Calcular as opções globais de filtros e seus relacionamentos
    const globalAgg = full.globalAgg || aggregate(full.records);
    const options = {
      distritoriais: globalAgg.distritoriais.map(d => ({ nome: d.nome })),
      coordenadores: globalAgg.coordenadores.map(c => ({ nome: c.nome, distrital: c.distrital })),
      filiais: globalAgg.filiais.map(f => ({ nome: f.nome, coordenador: f.coordenador })),
      grupos: globalAgg.grupos.map(g => ({ nome: g.nomeOriginal || g.nome })),
      linhas: globalAgg.linhas.map(l => ({ nome: l.nome, grupo: l.grupo }))
    };

    res.json({ status: 'ok', data, filters, options, cache_age_ms: Date.now() - cache.ts });
  } catch (err) {
    console.error('[/api/metas] Erro:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
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
    const globalAgg = full.globalAgg || aggregate(full.records);
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

// Limpar cache + recarregar (para botão de refresh)
app.post('/api/refresh', async (req, res) => {
  clearCache();
  try {
    const full = await getCached();
    res.json({ status: 'ok', msg: 'Cache limpo e dados recarregados', rows: full.filiais.length });
  } catch (err) {
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
  });
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
  console.log(`\n🚀 Dashboard Diretoria C — http://localhost:${PORT}`);
  console.log(`📊 Excel: ${EXCEL_PATH}`);
  console.log(`   Existe: ${fs.existsSync(EXCEL_PATH) ? '✅' : '❌'}\n`);

  // ─── Keep-alive: pinga o próprio servidor a cada 10 min ─────────────────
  // Evita que o Render Free Tier hiberne e perca os arquivos em disco.
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const http = require('https');
    const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
    setInterval(() => {
      const url = `${RENDER_URL}/api/health`;
      http.get(url, (res) => {
        console.log(`💓 Keep-alive ping → ${url} [${res.statusCode}]`);
      }).on('error', (err) => {
        console.warn(`⚠️ Keep-alive falhou: ${err.message}`);
      });
    }, PING_INTERVAL_MS);
    console.log(`💓 Keep-alive ativo: pingando ${RENDER_URL}/api/health a cada 10 min`);
  }
});
