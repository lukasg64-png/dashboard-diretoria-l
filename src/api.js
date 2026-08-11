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
  getCoupons: () => req('/coupons'),
  health: () => req('/health'),
  triggerSync: (full = false) => fetch(`${BASE}/vtex-sync?full=${full}`, { method: 'POST' }).then(r => r.json()),
};
