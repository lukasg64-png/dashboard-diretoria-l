import React, { useState, useEffect, useMemo } from 'react';
import { Tag, DollarSign, ShoppingBag, RefreshCw, ChevronDown, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import * as XLSX from 'xlsx';
import API from '../api';

const fmtCurrency = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtInteger = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

function getBrtDateStr(daysAgo = 0) {
  try {
    const d = new Date(Date.now() - daysAgo * 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function CuponsPage({
  couponRaw = [],
  couponLoading = false,
  couponSync = null,
  couponTotalOrders = 0,
  loadCoupons,
  fDist,
  setFDist,
  fCoord,
  setFCoord,
  fFilial,
  setFFilial,
  fDateMode,
  setFDateMode,
  fCustomDate,
  setFCustomDate,
  fCoupon,
  setFCoupon,
}) {
  const [error, setError] = useState(null);

  // View mode: resumo ou detalhes
  const [viewTab, setViewTab] = useState('resumo');

  // Paginação da tabela detalhada
  const [page, setPage] = useState(0);
  const rowsPerPage = 15;

  // Hierarquia expandida
  const [openDist, setOpenDist] = useState(new Set());
  const [openCoord, setOpenCoord] = useState(new Set());

  const handleRefresh = async () => {
    setError(null);
    try {
      await loadCoupons();
    } catch (err) {
      setError(err.message || 'Erro ao recarregar.');
    }
  };

  // Filtrar por data
  const dataByDate = useMemo(() => {
    if (!Array.isArray(couponRaw) || couponRaw.length === 0) return [];

    let startDate, endDate;
    const today = getBrtDateStr(0);

    switch (fDateMode) {
      case 'hoje':
        startDate = today;
        endDate = today;
        break;
      case 'ontem':
        startDate = getBrtDateStr(1);
        endDate = getBrtDateStr(1);
        break;
      case '3d':
        startDate = getBrtDateStr(2);
        endDate = today;
        break;
      case '7d':
        startDate = getBrtDateStr(6);
        endDate = today;
        break;
      case '15d':
        startDate = getBrtDateStr(14);
        endDate = today;
        break;
      case 'custom':
        startDate = fCustomDate || today;
        endDate = fCustomDate || today;
        break;
      default:
        startDate = today;
        endDate = today;
    }

    return couponRaw.filter(item => {
      if (!item) return false;
      const d = item.date;
      const u = item.utcDate;
      return (d && d >= startDate && d <= endDate) || (u && u >= startDate && u <= endDate);
    });
  }, [couponRaw, fDateMode, fCustomDate]);

  // Opções dinâmicas dos dropdowns
  const filterOptions = useMemo(() => {
    const dists = new Set();
    const coords = new Set();
    const filiais = new Set();

    (dataByDate || []).forEach(item => {
      if (item && item.distrital) dists.add(item.distrital);
      if (item && item.coordenador) coords.add(item.coordenador);
      if (item && item.store) filiais.add(item.store);
    });

    return {
      distritais: Array.from(dists).sort(),
      coordenadores: Array.from(coords).sort(),
      filiais: Array.from(filiais).sort()
    };
  }, [dataByDate]);

  // Aplicar filtros
  const filteredData = useMemo(() => {
    let result = dataByDate || [];

    if (fDist && fDist !== 'all') result = result.filter(item => item && item.distrital === fDist);
    if (fCoord && fCoord !== 'all') result = result.filter(item => item && item.coordenador === fCoord);
    if (fFilial && fFilial !== 'all') result = result.filter(item => item && item.store === fFilial);
    if (fCoupon && String(fCoupon).trim()) {
      const query = String(fCoupon).toLowerCase().trim();
      result = result.filter(item => item && item.coupon && String(item.coupon).toLowerCase().includes(query));
    }

    return result;
  }, [dataByDate, fDist, fCoord, fFilial, fCoupon]);

  useEffect(() => { setPage(0); }, [fDist, fCoord, fFilial, fCoupon, fDateMode, fCustomDate]);

  // KPIs
  const kpi = useMemo(() => {
    const totalUses = filteredData.length;
    const totalRevenue = filteredData.reduce((sum, item) => sum + (item.value || 0), 0);
    const avgTicket = totalUses > 0 ? totalRevenue / totalUses : 0;
    const uniqueCoupons = new Set(filteredData.map(i => i.coupon)).size;

    return { totalUses, totalRevenue, avgTicket, uniqueCoupons };
  }, [filteredData]);

  // Ranking de cupons (resumo)
  const couponRanking = useMemo(() => {
    const map = {};
    filteredData.forEach(item => {
      if (!map[item.coupon]) {
        map[item.coupon] = { coupon: item.coupon, uses: 0, revenue: 0 };
      }
      map[item.coupon].uses++;
      map[item.coupon].revenue += item.value || 0;
    });
    return Object.values(map).sort((a, b) => b.uses - a.uses);
  }, [filteredData]);

  // Hierarquia: Distrital → Coordenador → Filial
  const hierarchy = useMemo(() => {
    const distMap = {};
    filteredData.forEach(item => {
      const d = item.distrital || 'Outros';
      const c = item.coordenador || 'Outros';
      const f = item.store || 'Sem Loja';

      if (!distMap[d]) distMap[d] = { nome: d, uses: 0, revenue: 0, coords: {} };
      distMap[d].uses++;
      distMap[d].revenue += item.value || 0;

      if (!distMap[d].coords[c]) distMap[d].coords[c] = { nome: c, uses: 0, revenue: 0, filiais: {} };
      distMap[d].coords[c].uses++;
      distMap[d].coords[c].revenue += item.value || 0;

      if (!distMap[d].coords[c].filiais[f]) distMap[d].coords[c].filiais[f] = { nome: f, uses: 0, revenue: 0 };
      distMap[d].coords[c].filiais[f].uses++;
      distMap[d].coords[c].filiais[f].revenue += item.value || 0;
    });

    return Object.values(distMap)
      .map(d => ({
        ...d,
        coords: Object.values(d.coords)
          .map(c => ({
            ...c,
            filiais: Object.values(c.filiais).sort((a, b) => b.uses - a.uses)
          }))
          .sort((a, b) => b.uses - a.uses)
      }))
      .sort((a, b) => b.uses - a.uses);
  }, [filteredData]);

  // Gráfico temporal
  const timeChartData = useMemo(() => {
    const groups = {};
    (filteredData || []).forEach(item => {
      if (!item) return;
      const date = item.date || 'Sem Data';
      if (!groups[date]) groups[date] = { date, cupons: 0, valor: 0 };
      groups[date].cupons++;
      groups[date].valor += item.value || 0;
    });
    return Object.values(groups).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }, [filteredData]);

  // Top 10 cupons para gráfico
  const topCouponsChart = useMemo(() => couponRanking.slice(0, 10), [couponRanking]);

  const [chartMode, setChartMode] = useState('diario');

  // Ajusta automaticamente o modo do gráfico caso o período selecionado seja de 1 dia
  useEffect(() => {
    if (timeChartData.length <= 1) {
      setChartMode('geo');
    }
  }, [timeChartData]);

  // Rótulo do drill atual
  const geoDrillLabel = useMemo(() => {
    if (fDist === 'all') return 'Distrital';
    if (fCoord === 'all') return 'Coordenador';
    return 'Filial';
  }, [fDist, fCoord]);

  // Função para voltar o drill-down
  const handleBackDrill = () => {
    if (fFilial !== 'all') {
      setFFilial('all');
    } else if (fCoord !== 'all') {
      setFCoord('all');
    } else if (fDist !== 'all') {
      setFDist('all');
    }
  };

  // Função de clique no gráfico de barras geográfico
  const handleGeoChartClick = (name) => {
    if (name === 'Outros') return;
    if (fDist === 'all') {
      setFDist(name);
    } else if (fCoord === 'all') {
      setFCoord(name);
    } else if (fFilial === 'all') {
      setFFilial(name);
    }
  };

  // Dados do gráfico geográfico agrupado reativo
  const geoChartData = useMemo(() => {
    const map = {};
    const keyField = fDist === 'all' ? 'distrital'
      : fCoord === 'all' ? 'coordenador'
      : 'store';

    filteredData.forEach(item => {
      const key = item[keyField] || 'Outros';
      if (!map[key]) map[key] = { name: key, cupons: 0, valor: 0 };
      map[key].cupons++;
      map[key].valor += item.value || 0;
    });

    return Object.values(map).sort((a, b) => b.cupons - a.cupons);
  }, [filteredData, fDist, fCoord]);

  // Tabela paginada
  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, page]);
  const maxPages = Math.ceil(filteredData.length / rowsPerPage);

  // Toggle hierarquia
  const togDist = (nome) => setOpenDist(s => { const n = new Set(s); n.has(nome) ? n.delete(nome) : n.add(nome); return n; });
  const togCoord = (nome) => setOpenCoord(s => { const n = new Set(s); n.has(nome) ? n.delete(nome) : n.add(nome); return n; });

  // Label do período selecionado
  const periodLabel = useMemo(() => {
    const safeFmt = str => {
      if (!str || typeof str !== 'string') return '';
      const p = str.split('-');
      return p.length === 3 ? p.reverse().join('/') : str;
    };
    switch (fDateMode) {
      case 'hoje': return `Hoje (${safeFmt(getBrtDateStr(0))})`;
      case 'ontem': return `Ontem (${safeFmt(getBrtDateStr(1))})`;
      case '3d': return 'Últimos 3 dias';
      case '7d': return 'Últimos 7 dias';
      case '15d': return 'Últimos 15 dias';
      case 'custom': return safeFmt(fCustomDate);
      default: return '';
    }
  }, [fDateMode, fCustomDate]);

  // Exportar relatórios para Excel em arquivo multi-abas (.xlsx)
  const handleExportExcel = () => {
    if (!filteredData || filteredData.length === 0) return;

    const xlsxLib = window.XLSX || XLSX;
    if (!xlsxLib) {
      alert('Biblioteca Excel indisponível no momento.');
      return;
    }

    // 1. Aba Ranking
    const rankingSheetData = couponRanking.map((item, idx) => ({
      'Posição': idx + 1,
      'Código do Cupom': item.coupon,
      'Usos': item.uses,
      'Faturamento (R$)': Number((item.revenue || 0).toFixed(2)),
      'Ticket Médio (R$)': Number((item.uses > 0 ? item.revenue / item.uses : 0).toFixed(2))
    }));

    // 2. Aba Hierarquia (Distrital -> Coordenador -> Filial)
    const hierarchyRows = [];
    hierarchy.forEach(dist => {
      dist.coords.forEach(coord => {
        coord.filiais.forEach(fil => {
          hierarchyRows.push({
            'Distrital': dist.nome,
            'Coordenador': coord.nome,
            'Filial / Loja': fil.nome,
            'Cupons Usados': fil.uses,
            'Faturamento (R$)': Number((fil.revenue || 0).toFixed(2)),
            'Ticket Médio (R$)': Number((fil.uses > 0 ? fil.revenue / fil.uses : 0).toFixed(2))
          });
        });
      });
    });

    // 3. Aba Detalhes (Pedido a Pedido)
    const detailsSheetData = filteredData.map(item => ({
      'Nº Pedido': item.orderId || '',
      'Data / Hora (BRT)': item.dateTimeStr || (item.date ? item.date.split('-').reverse().join('/') : ''),
      'Cupom': item.coupon || '',
      'Filial / Loja': item.store || '',
      'Coordenador': item.coordenador || '',
      'Distrital': item.distrital || '',
      'Valor (R$)': Number((item.value || 0).toFixed(2))
    }));

    const wb = xlsxLib.utils.book_new();

    const wsRanking = xlsxLib.utils.json_to_sheet(rankingSheetData);
    const wsHierarchy = xlsxLib.utils.json_to_sheet(hierarchyRows);
    const wsDetails = xlsxLib.utils.json_to_sheet(detailsSheetData);

    const autoWidth = (ws, data) => {
      if (!data || data.length === 0) return;
      const colWidths = Object.keys(data[0]).map(key => {
        const maxLen = Math.max(
          key.length,
          ...data.map(row => String(row[key] ?? '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
      });
      ws['!cols'] = colWidths;
    };

    autoWidth(wsRanking, rankingSheetData);
    autoWidth(wsHierarchy, hierarchyRows);
    autoWidth(wsDetails, detailsSheetData);

    xlsxLib.utils.book_append_sheet(wb, wsRanking, 'Ranking Cupons');
    xlsxLib.utils.book_append_sheet(wb, wsHierarchy, 'Por Hierarquia');
    xlsxLib.utils.book_append_sheet(wb, wsDetails, 'Detalhes Pedidos');

    const dateStr = getBrtDateStr(0);
    const fileName = `cupons_vtex_${fDateMode}_${dateStr}.xlsx`;

    xlsxLib.writeFile(wb, fileName);
  };

  if (couponLoading && couponRaw.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '60px 24px', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 48, height: 48, border: '3px solid #e2e8f0', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Carregando dados de cupons de desconto da VTEX...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ══════ BANNER DE STATUS E ÚLTIMA ATUALIZAÇÃO VTEX ══════ */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '10px 16px',
        border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0f2050', fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: couponSync?.isSyncing ? '#3b82f6' : '#10b981', display: 'inline-block' }} />
          <span>⚡ Acompanhamento de Cupons VTEX OMS</span>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
            (Última atualização VTEX: <strong style={{ color: '#0f2050' }}>{couponSync?.lastSyncTime ? new Date(couponSync.lastSyncTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Carregando...'}</strong>)
          </span>
        </div>
        {couponSync?.isSyncing && (
          <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
            🔄 Sincronizando pedidos VTEX... {couponSync.progressPercent || 0}%
          </span>
        )}
      </div>

      {/* ══════ BARRA DE FILTROS ══════ */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2050 0%, #1e3a8a 100%)',
        borderRadius: 10, padding: '16px 20px', color: '#fff',
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
        boxShadow: '0 4px 12px rgba(15,32,80,0.3)'
      }}>

        {/* Data Mode */}
        <div style={filterCol}>
          <label style={filterLabel}>📅 Período</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { key: 'hoje', label: 'Hoje' },
              { key: 'ontem', label: 'Ontem' },
              { key: '3d', label: '3 dias' },
              { key: '7d', label: '7 dias' },
              { key: '15d', label: '15 dias' },
            ].map(btn => (
              <button
                key={btn.key}
                onClick={() => setFDateMode(btn.key)}
                style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: 700,
                  borderRadius: 5, border: 'none', cursor: 'pointer',
                  background: fDateMode === btn.key ? '#7c3aed' : 'rgba(255,255,255,0.12)',
                  color: fDateMode === btn.key ? '#fff' : 'rgba(255,255,255,0.7)',
                  transition: 'all 0.15s'
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data custom */}
        <div style={filterCol}>
          <label style={filterLabel}>Dia Específico</label>
          <input
            type="date"
            value={fCustomDate}
            onChange={e => { setFCustomDate(e.target.value); setFDateMode('custom'); }}
            style={inputStyle}
          />
        </div>

        {/* Distrital */}
        <div style={filterCol}>
          <label style={filterLabel}>Distrital</label>
          <select value={fDist} onChange={e => { setFDist(e.target.value); setFCoord('all'); setFFilial('all'); }} style={selectStyle}>
            <option value="all">Todos</option>
            {filterOptions.distritais.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Coordenador */}
        <div style={filterCol}>
          <label style={filterLabel}>Coordenação</label>
          <select value={fCoord} onChange={e => { setFCoord(e.target.value); setFFilial('all'); }} style={selectStyle}>
            <option value="all">Todos</option>
            {filterOptions.coordenadores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Filial */}
        <div style={filterCol}>
          <label style={filterLabel}>Filial</label>
          <select value={fFilial} onChange={e => setFFilial(e.target.value)} style={selectStyle}>
            <option value="all">Todas</option>
            {filterOptions.filiais.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Buscar Cupom */}
        <div style={{ ...filterCol, flex: 1, minWidth: 130 }}>
          <label style={filterLabel}>🔍 Buscar Cupom</label>
          <input
            type="text"
            placeholder="Ex: GANHOU20..."
            value={fCoupon}
            onChange={e => setFCoupon(e.target.value)}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Atualizar */}
        <button onClick={handleRefresh} style={{
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600
        }}>
          <RefreshCw size={13} /> Atualizar
        </button>

        {/* Baixar Excel */}
        <button
          onClick={handleExportExcel}
          disabled={filteredData.length === 0}
          style={{
            background: filteredData.length === 0 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6, padding: '6px 14px',
            cursor: filteredData.length === 0 ? 'not-allowed' : 'pointer',
            color: filteredData.length === 0 ? 'rgba(255,255,255,0.4)' : '#fff',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
            boxShadow: filteredData.length === 0 ? 'none' : '0 2px 8px rgba(16,185,129,0.35)',
            transition: 'all 0.15s ease'
          }}
          title="Baixar dados filtrados em formato Excel (.xlsx)"
        >
          <FileSpreadsheet size={14} /> Baixar Excel
        </button>
      </div>

      {/* Sync Status */}
      {couponSync && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '6px 16px', fontSize: 11, color: '#64748b',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>
            ⏰ <strong>Sync VTEX:</strong> {couponSync.isSyncing ? `Sincronizando (${couponSync.progressPercent}%)…` : 'Pronto'}
            {couponTotalOrders > 0 && <span> · {fmtInteger(couponTotalOrders)} pedidos no cache</span>}
          </span>
          {couponSync.lastSyncTime && (
            <span>Último sync: {new Date(couponSync.lastSyncTime).toLocaleString('pt-BR')}</span>
          )}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
          ⚠️ {error} · <button onClick={handleRefresh} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>Tentar novamente</button>
        </div>
      )}

      {/* ══════ KPIs ══════ */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard icon={<Tag size={18} />} color="#7c3aed" bg="#f5f3ff" label="Cupons Usados" value={fmtInteger(kpi.totalUses)} sub={`${kpi.uniqueCoupons} cupons distintos`} />
        <KpiCard icon={<DollarSign size={18} />} color="#10b981" bg="#ecfdf5" label="Faturamento c/ Cupom" value={fmtCurrency(kpi.totalRevenue)} sub={`Período: ${periodLabel}`} />
        <KpiCard icon={<ShoppingBag size={18} />} color="#3b82f6" bg="#eff6ff" label="Ticket Médio" value={fmtCurrency(kpi.avgTicket)} sub="Valor médio dos pedidos" />
      </div>

      {/* ══════ TABS: Resumo / Hierarquia / Detalhes ══════ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
        {[
          { key: 'resumo', label: '🏆 Ranking de Cupons' },
          { key: 'hierarquia', label: '🏢 Distrital → Coord. → Filial' },
          { key: 'detalhes', label: '📋 Detalhes (Pedido a Pedido)' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setViewTab(t.key)}
            style={{
              padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: viewTab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
              border: '1px solid #e2e8f0',
              borderBottom: viewTab === t.key ? '1px solid #fff' : '1px solid #e2e8f0',
              borderRadius: '6px 6px 0 0',
              color: viewTab === t.key ? '#0f2050' : '#64748b',
              position: 'relative', bottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ CONTEÚDO ══════ */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 6px 6px 6px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden'
      }}>

        {/* ── TAB 1: Ranking de Cupons ── */}
        {viewTab === 'resumo' && (
          <div>
            {/* Gráficos lado a lado */}
            {filteredData.length > 0 && (
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>

                {/* Gráfico Esquerdo: Diário ou Geográfico (Drill-down) */}
                <div style={{ flex: 2, minWidth: 350, padding: 16, borderRight: '1px solid #f1f5f9' }}>
                  {/* Header do Gráfico com Toggle e Breadcrumb */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ ...chartTitle, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {chartMode === 'diario' ? '📈 Uso Diário de Cupons' : `🏢 Cupons por ${geoDrillLabel}`}
                      {chartMode === 'geo' && (fDist !== 'all' || fCoord !== 'all' || fFilial !== 'all') && (
                        <span style={{ fontSize: 10, color: '#7c3aed', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          Drill Ativo
                        </span>
                      )}
                    </h4>
                    
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {chartMode === 'geo' && (fDist !== 'all' || fCoord !== 'all' || fFilial !== 'all') && (
                        <button
                          onClick={handleBackDrill}
                          style={{
                            padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                            border: '1px solid #7c3aed', background: '#fff', color: '#7c3aed',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#7c3aed'; }}
                        >
                          ⬅ Voltar Nível
                        </button>
                      )}
                      
                      <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                        <button
                          onClick={() => setChartMode('diario')}
                          disabled={timeChartData.length <= 1}
                          style={{
                            padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 4,
                            border: 'none', cursor: timeChartData.length <= 1 ? 'not-allowed' : 'pointer',
                            background: chartMode === 'diario' ? '#7c3aed' : 'transparent',
                            color: chartMode === 'diario' ? '#fff' : (timeChartData.length <= 1 ? '#cbd5e1' : '#64748b'),
                            transition: 'all 0.1s'
                          }}
                        >
                          Diário
                        </button>
                        <button
                          onClick={() => setChartMode('geo')}
                          style={{
                            padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 4,
                            border: 'none', cursor: 'pointer',
                            background: chartMode === 'geo' ? '#7c3aed' : 'transparent',
                            color: chartMode === 'geo' ? '#fff' : '#64748b',
                            transition: 'all 0.1s'
                          }}
                        >
                          Geográfico
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 220 }}>
                    {chartMode === 'diario' && timeChartData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timeChartData}>
                          <defs>
                            <linearGradient id="colorCupons" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} fontWeight={600}
                            tickFormatter={v => v ? String(v).split('-').slice(1).reverse().join('/') : ''} />
                          <YAxis stroke="#94a3b8" fontSize={9} fontWeight={600} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            labelFormatter={l => `Data: ${l ? String(l).split('-').reverse().join('/') : ''}`}
                            formatter={(v, name) => name === 'valor' ? [fmtCurrency(v), 'Faturamento'] : [fmtInteger(v), 'Cupons']}
                          />
                          <Area type="monotone" dataKey="cupons" stroke="#7c3aed" strokeWidth={2} fillOpacity={1} fill="url(#colorCupons)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={geoChartData} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="name"
                            stroke="#94a3b8"
                            fontSize={9}
                            fontWeight={700}
                            tickFormatter={v => v.length > 15 ? v.slice(0, 15) + '…' : v}
                          />
                          <YAxis stroke="#94a3b8" fontSize={9} fontWeight={600} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(v, name) => name === 'valor' ? [fmtCurrency(v), 'Faturamento'] : [fmtInteger(v), 'Cupons']}
                          />
                          <Bar
                            dataKey="cupons"
                            fill="#7c3aed"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={30}
                            cursor="pointer"
                            onClick={(data) => {
                              if (data && data.name) {
                                handleGeoChartClick(data.name);
                              }
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {chartMode === 'geo' && (
                    <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', marginTop: 4, fontWeight: 500 }}>
                      💡 Clique em uma barra para fazer drill-down: Distrital ➔ Coordenador ➔ Filial
                    </div>
                  )}
                </div>

                {/* Gráfico: Top Cupons */}
                {topCouponsChart.length > 0 && (
                  <div style={{ flex: 1, minWidth: 260, padding: 16 }}>
                    <h4 style={chartTitle}>🔥 Top {Math.min(10, topCouponsChart.length)} Cupons</h4>
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topCouponsChart} layout="vertical" margin={{ left: 5, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" stroke="#94a3b8" fontSize={9} fontWeight={600} hide />
                          <YAxis dataKey="coupon" type="category" stroke="#0f2050" fontSize={9} fontWeight={700} width={80} tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtInteger(v), 'Utilizações']} />
                          <Bar dataKey="uses" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabela de Ranking */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2050' }}>
                  Ranking de Cupons de Desconto — {periodLabel}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 12, background: '#f1f5f9', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  {couponRanking.length} cupons distintos
                </span>
              </div>
              <button
                onClick={handleExportExcel}
                disabled={filteredData.length === 0}
                style={tabDownloadBtnStyle(filteredData.length === 0)}
                title="Baixar dados do ranking em Excel"
              >
                <Download size={13} /> Baixar Excel
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableBase}>
                <thead>
                  <tr style={theadRow}>
                    <th style={{ ...thCell, textAlign: 'center', width: 40 }}>#</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>Código do Cupom</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Usos</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Faturamento</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {couponRanking.length === 0 ? (
                    <tr><td colSpan={5} style={emptyCell}>Nenhum cupom encontrado no período selecionado.</td></tr>
                  ) : (
                    couponRanking.map((item, idx) => (
                      <tr key={item.coupon} style={tbodyRow}>
                        <td style={{ ...tdCell, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={tdCell}><span style={badgeStyle}>{item.coupon}</span></td>
                        <td style={{ ...tdCell, textAlign: 'right', fontWeight: 800, color: '#0f2050', fontSize: 14 }}>{fmtInteger(item.uses)}</td>
                        <td style={{ ...tdCell, textAlign: 'right', color: '#047857', fontWeight: 700 }}>{fmtCurrency(item.revenue)}</td>
                        <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{fmtCurrency(item.uses > 0 ? item.revenue / item.uses : 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 2: Hierarquia ── */}
        {viewTab === 'hierarquia' && (
          <div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2050' }}>
                Cupons por Distrital → Coordenador → Filial — {periodLabel}
              </span>
              <button
                onClick={handleExportExcel}
                disabled={filteredData.length === 0}
                style={tabDownloadBtnStyle(filteredData.length === 0)}
                title="Baixar dados de hierarquia em Excel"
              >
                <Download size={13} /> Baixar Excel
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableBase}>
                <thead>
                  <tr style={theadRow}>
                    <th style={{ ...thCell, textAlign: 'left', minWidth: 280 }}>Distrital / Coordenador / Filial</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Cupons Usados</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Faturamento</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {hierarchy.length === 0 ? (
                    <tr><td colSpan={4} style={emptyCell}>Sem dados de cupons no período.</td></tr>
                  ) : hierarchy.map(dist => {
                    const isDistOpen = openDist.has(dist.nome);
                    return (
                      <React.Fragment key={`d-${dist.nome}`}>
                        {/* Distrital Row */}
                        <tr style={{ ...tbodyRow, background: 'rgba(15,32,80,0.04)' }}>
                          <td style={{ ...tdCell, paddingLeft: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button onClick={() => togDist(dist.nome)} style={expandBtn(isDistOpen)}>
                                {isDistOpen ? '−' : '+'}
                              </button>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f2050' }}>{dist.nome}</span>
                            </div>
                          </td>
                          <td style={{ ...tdCell, textAlign: 'right', fontWeight: 800, color: '#0f2050', fontSize: 15 }}>{fmtInteger(dist.uses)}</td>
                          <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtCurrency(dist.revenue)}</td>
                          <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{fmtCurrency(dist.uses > 0 ? dist.revenue / dist.uses : 0)}</td>
                        </tr>

                        {/* Coordenadores */}
                        {isDistOpen && dist.coords.map(coord => {
                          const isCoordOpen = openCoord.has(`${dist.nome}|${coord.nome}`);
                          return (
                            <React.Fragment key={`c-${dist.nome}-${coord.nome}`}>
                              <tr style={tbodyRow}>
                                <td style={{ ...tdCell, paddingLeft: 36 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button onClick={() => togCoord(`${dist.nome}|${coord.nome}`)} style={expandBtn(isCoordOpen)}>
                                      {isCoordOpen ? '−' : '+'}
                                    </button>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b' }}>{coord.nome}</span>
                                  </div>
                                </td>
                                <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#334155', fontSize: 13 }}>{fmtInteger(coord.uses)}</td>
                                <td style={{ ...tdCell, textAlign: 'right', color: '#047857', fontWeight: 600 }}>{fmtCurrency(coord.revenue)}</td>
                                <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{fmtCurrency(coord.uses > 0 ? coord.revenue / coord.uses : 0)}</td>
                              </tr>

                              {/* Filiais */}
                              {isCoordOpen && coord.filiais.map(fil => (
                                <tr key={`f-${dist.nome}-${coord.nome}-${fil.nome}`} style={tbodyRow}>
                                  <td style={{ ...tdCell, paddingLeft: 60 }}>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>{fil.nome}</span>
                                  </td>
                                  <td style={{ ...tdCell, textAlign: 'right', fontWeight: 600, color: '#475569' }}>{fmtInteger(fil.uses)}</td>
                                  <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{fmtCurrency(fil.revenue)}</td>
                                  <td style={{ ...tdCell, textAlign: 'right', color: '#94a3b8' }}>{fmtCurrency(fil.uses > 0 ? fil.revenue / fil.uses : 0)}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* Totais */}
                {hierarchy.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                      <td style={{ padding: '10px 12px 10px 16px', fontWeight: 800, color: '#0f2050', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TOTAL GERAL</td>
                      <td style={{ ...tdCell, textAlign: 'right', fontWeight: 800, color: '#0f2050', fontSize: 15 }}>{fmtInteger(kpi.totalUses)}</td>
                      <td style={{ ...tdCell, textAlign: 'right', fontWeight: 800, color: '#047857' }}>{fmtCurrency(kpi.totalRevenue)}</td>
                      <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#475569' }}>{fmtCurrency(kpi.avgTicket)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8', background: '#fafafa' }}>
              💡 Clique no + ao lado do nome para expandir: Distrital → Coordenação → Filial
            </div>
          </div>
        )}

        {/* ── TAB 3: Detalhes ── */}
        {viewTab === 'detalhes' && (
          <div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2050' }}>Detalhes de Utilização — {periodLabel}</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 12, background: '#f1f5f9', borderRadius: 4, padding: '3px 8px', fontWeight: 600 }}>{filteredData.length} registros</span>
              </div>
              <button
                onClick={handleExportExcel}
                disabled={filteredData.length === 0}
                style={tabDownloadBtnStyle(filteredData.length === 0)}
                title="Baixar detalhes dos pedidos em Excel"
              >
                <Download size={13} /> Baixar Excel
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableBase}>
                <thead>
                  <tr style={theadRow}>
                    <th style={{ ...thCell, textAlign: 'left' }}>Data / Hora (BRT)</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>Cupom</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>Loja</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>Coordenador</th>
                    <th style={{ ...thCell, textAlign: 'left' }}>Distrital</th>
                    <th style={{ ...thCell, textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={6} style={emptyCell}>Nenhuma utilização de cupom encontrada.</td></tr>
                  ) : paginatedData.map((item, idx) => (
                    <tr key={idx} style={tbodyRow}>
                      <td style={{ ...tdCell, color: '#0f2050', fontWeight: 600 }}>{item.dateTimeStr || (item.date ? item.date.split('-').reverse().join('/') : '—')}</td>
                      <td style={tdCell}><span style={badgeStyle}>{item.coupon}</span></td>
                      <td style={{ ...tdCell, color: '#1e3a8a', fontWeight: 600 }}>{item.store}</td>
                      <td style={tdCell}>{item.coordenador}</td>
                      <td style={tdCell}>{item.distrital}</td>
                      <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtCurrency(item.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {maxPages > 1 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>Página <strong>{page + 1}</strong> de <strong>{maxPages}</strong></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pagBtn(page === 0)}>Anterior</button>
                  <button disabled={page >= maxPages - 1} onClick={() => setPage(p => p + 1)} style={pagBtn(page >= maxPages - 1)}>Próximo</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function KpiCard({ icon, color, bg, label, value, sub }) {
  return (
    <div style={{
      flex: 1, minWidth: 200, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
    }}>
      <div style={{ background: bg, color, padding: 9, borderRadius: 6, display: 'flex' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f2050', marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const filterCol = { display: 'flex', flexDirection: 'column', gap: 5 };
const filterLabel = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' };
const selectStyle = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 11,
  outline: 'none', cursor: 'pointer', minWidth: 130, maxWidth: 190
};
const inputStyle = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 11, outline: 'none'
};
const tooltipStyle = { background: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: 6, fontSize: 11, color: '#fff' };
const chartTitle = { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#0f2050', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tableBase = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const theadRow = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 };
const thCell = { padding: '9px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', whiteSpace: 'nowrap' };
const tdCell = { padding: '9px 12px', color: '#475569', fontSize: 12, verticalAlign: 'middle', whiteSpace: 'nowrap' };
const tbodyRow = { borderBottom: '1px solid #f1f5f9' };
const emptyCell = { padding: 32, textAlign: 'center', color: '#94a3b8' };
const badgeStyle = { background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#7c3aed', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px' };
const pagBtn = (disabled) => ({
  padding: '4px 10px', fontSize: 11, borderRadius: 4, border: '1px solid #cbd5e1',
  background: '#fff', color: disabled ? '#94a3b8' : '#475569',
  cursor: disabled ? 'not-allowed' : 'pointer'
});
const expandBtn = (isOpen) => ({
  width: 18, height: 18, borderRadius: 3,
  border: '1px solid #1e3a8a',
  background: isOpen ? '#1e3a8a' : '#fff',
  color: isOpen ? '#fff' : '#1e3a8a',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 700, lineHeight: 1, flexShrink: 0,
});

const tabDownloadBtnStyle = (disabled) => ({
  background: disabled ? '#e2e8f0' : '#10b981',
  border: 'none',
  borderRadius: 5,
  padding: '5px 12px',
  color: disabled ? '#94a3b8' : '#fff',
  fontSize: 11,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  boxShadow: disabled ? 'none' : '0 1px 3px rgba(16,185,129,0.3)',
  transition: 'all 0.15s ease'
});
