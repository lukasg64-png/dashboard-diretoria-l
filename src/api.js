const BASE = window.location.port === '5174' || window.location.port === '5173' ? 'http://localhost:3005/api' : '/api';

async function req(path, params = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== 'all') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Erro HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.error);
  return json;
}

export default {
  getData: (filters) => req('/metas', filters),
  getMetas: (filters) => req('/metas', filters),
  getFilters: () => req('/filtros'),
  getCoupons: () => req('/coupons'),
  health: () => req('/health'),
  triggerSync: (full = false) => fetch(`${BASE}/vtex-sync?full=${full}`, { method: 'POST' }).then(r => r.json()),
  uploadExcel: async (file, token) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('token', token);
    const res = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || json.status !== 'ok') throw new Error(json.error || 'Erro no upload');
    return json;
  }
};
