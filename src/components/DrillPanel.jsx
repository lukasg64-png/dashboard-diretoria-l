import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Upload, RefreshCw, ChevronDown, X, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import API from '../api';

// ── Formatadores ────────────────────────────────────────────────────────────
const fmtR = v => {
  if (v == null || v === '') return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(2).replace('.', ',') + 'M';
  if (abs >= 1_000)     return (v / 1_000).toFixed(1).replace('.', ',') + 'K';
  return Number(v).toFixed(0);
};
const fmtPct = v => v == null ? '—' : `${Number(v).toFixed(1).replace('.', ',')}%`;
const fmtEvol = v => {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + Number(v).toFixed(1).replace('.', ',') + '%';
};

// ── Cores ───────────────────────────────────────────────────────────────────
const cEvol = v => v == null ? '#94a3b8' : v >= 0 ? '#059669' : '#dc2626';
const cMeta = v => {
  if (v == null) return '#94a3b8';
  if (v >= 90) return '#059669';
  if (v >= 60) return '#d97706';
  return '#dc2626';
};
const desvioAbs = (venda, meta) => (venda != null && meta != null) ? venda - meta : null;
const desvioPct = (venda, meta) => (meta && meta !== 0) ? ((venda - meta) / meta) * 100 : null;

const renderCustomLabel = (props) => {
  const { x, y, width, value } = props;
  if (value === 0 || value == null) return null;
  const yOffset = value >= 0 ? -6 : 12;
  const color = value >= 0 ? '#059669' : '#dc2626';
  return (
    <text 
      x={x + width / 2} 
      y={y + yOffset} 
      fill={color} 
      textAnchor="middle" 
      style={{ fontSize: 9, fontWeight: 700 }}
    >
      {value > 0 ? '+' : ''}{fmtR(value)}
    </text>
  );
};

const renderCustomPartLabel = (props) => {
  const { x, y, width, value } = props;
  if (value == null) return null;
  const payload = props.payload;
  const diff = payload ? payload.diff_pp : null;
  const diffStr = diff != null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')} pp` : '';
  const diffColor = diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#64748b';

  return (
    <g>
      <text 
        x={x + width / 2} 
        y={y - 12} 
        fill="#0f2050" 
        textAnchor="middle" 
        style={{ fontSize: 8, fontWeight: 700 }}
      >
        {Number(value).toFixed(1).replace('.', ',')}%
      </text>
      {diff != null && (
        <text 
          x={x + width / 2} 
          y={y - 2} 
          fill={diffColor} 
          textAnchor="middle" 
          style={{ fontSize: 8, fontWeight: 700 }}
        >
          {diffStr}
        </text>
      )}
    </g>
  );
};

// ── KPI Block ───────────────────────────────────────────────────────────────
function KpiBlock({ label, value, evol, evolLabel, sub, highlight }) {
  const ec = cEvol(evol);
  return (
    <div style={{
      flex: 1, minWidth: 160,
      padding: '14px 18px',
      borderRight: '1px solid #e2e8f0',
      background: highlight ? '#0f2050' : '#fff',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: highlight ? 'rgba(255,255,255,0.55)' : '#64748b' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: highlight ? '#fff' : '#0f2050' }}>
          {value}
        </span>
        {evol != null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: highlight ? (evol >= 0 ? '#6ee7b7' : '#fca5a5') : ec }}>
            {fmtEvol(evol)}
            {evolLabel && <span style={{ fontWeight: 400, fontSize: 10, color: highlight ? 'rgba(255,255,255,0.4)' : '#94a3b8', marginLeft: 3 }}>{evolLabel}</span>}
          </span>
        )}
      </div>
      {sub && (
        <span style={{ fontSize: 10, color: highlight ? 'rgba(255,255,255,0.45)' : '#94a3b8', marginTop: 2 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Barra de Meta ───────────────────────────────────────────────────────────
function MetaBar({ pct }) {
  const c = cMeta(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct || 0, 100)}%`, background: c, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', minWidth: 44, textAlign: 'right' }}>{fmtPct(pct)}</span>
    </div>
  );
}

// ── Célula Evolução ─────────────────────────────────────────────────────────
function Evol({ v }) {
  if (v == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const color = cEvol(v);
  const Icon = v >= 0 ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 700, fontSize: 12 }}>
      <Icon size={11} />{fmtEvol(v)}
    </span>
  );
}

// ── Célula Desvio ───────────────────────────────────────────────────────────
function Desvio({ venda, meta, badge }) {
  const abs = desvioAbs(venda, meta);
  const pct = desvioPct(venda, meta);
  if (abs == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const isPositive = abs >= 0;
  const color = isPositive ? '#047857' : '#b91c1c';
  const bg = isPositive ? '#ecfdf5' : '#fef2f2';
  const border = isPositive ? '1px solid #d1fae5' : '1px solid #fee2e2';

  if (badge) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{
          background: bg, border: border, color: color,
          borderRadius: 12, padding: '3px 8px', fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', minWidth: 64, justifyContent: 'center'
        }}>
          {isPositive ? '+' : ''}{fmtR(abs)}
        </div>
        <span style={{ fontSize: 9, color: isPositive ? '#059669' : '#dc2626', marginTop: 2, marginRight: 4, fontWeight: 600 }}>
          {fmtEvol(pct)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: isPositive ? '#059669' : '#dc2626' }}>{isPositive ? '+' : ''}{fmtR(abs)}</span>
      <span style={{ fontSize: 10, color: isPositive ? '#059669' : '#dc2626' }}>{fmtEvol(pct)}</span>
    </div>
  );
}

// ── Célula Participação ─────────────────────────────────────────────────────
function Part({ pct26, pct25, labelAno }) {
  if (pct26 == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const evol = (pct25 != null) ? pct26 - pct25 : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: '#7c3aed' }}>{fmtPct(pct26)}</span>
      {evol != null && <span style={{ fontSize: 10, color: cEvol(evol) }}>{fmtEvol(evol)} p.p.</span>}
    </div>
  );
}

// ── Dropdown de Filtro ──────────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </span>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          style={{
            background: value !== 'all' ? 'rgba(123,97,255,0.25)' : 'rgba(255,255,255,0.08)',
            border: value !== 'all' ? '1px solid rgba(123,97,255,0.6)' : '1px solid rgba(255,255,255,0.2)',
            color: '#fff', borderRadius: 6, padding: '5px 28px 5px 10px',
            fontSize: 12, fontWeight: value !== 'all' ? 700 : 400,
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none', appearance: 'none', minWidth: 160,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <option value="all" style={{ background: '#1e293b', color: '#fff' }}>Todos</option>
          {options.map(o => (
            <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>{o}</option>
          ))}
        </select>
        <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

// ── Linha da hierarquia principal ───────────────────────────────────────────
function HRow({ row, depth, expanded, hasChildren, onToggle, labelAtualAno }) {
  const bgRow = depth === 0 ? 'rgba(15,32,80,0.04)' : depth === 1 ? 'rgba(15,32,80,0.015)' : 'transparent';
  return (
    <tr
      style={{ borderBottom: '1px solid #e9eef4', background: bgRow, transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = bgRow; }}
    >
      <td style={{ padding: '9px 12px 9px 0', paddingLeft: 12 + depth * 22, whiteSpace: 'nowrap', minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {hasChildren ? (
            <button onClick={onToggle} style={{
              width: 18, height: 18, borderRadius: 3,
              border: `1px solid ${depth === 0 ? '#1e3a8a' : '#94a3b8'}`,
              background: expanded ? '#1e3a8a' : '#fff',
              color: expanded ? '#fff' : '#1e3a8a',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, lineHeight: 1, flexShrink: 0,
            }}>
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block', flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: depth === 0 ? 13 : 12,
            fontWeight: depth === 0 ? 700 : depth === 1 ? 600 : 400,
            color: depth === 0 ? '#0f2050' : depth === 1 ? '#1e3a8a' : '#475569',
          }}>
            {row.nome}
          </span>
        </div>
      </td>
      <td style={td()}>{fmtR(row.meta_total)}</td>
      <td style={{ ...td(), minWidth: 130 }}><MetaBar pct={row.pct_meta_total} /></td>
      <td style={td(true)}>{fmtR(row.venda_jul26)}</td>
      <td style={td()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: '#334155' }}>{fmtR(row.meta_parcial)}</span>
          <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>parcial</span>
        </div>
      </td>
      <td style={{ ...td(), minWidth: 90 }}><Desvio venda={row.venda_jul26} meta={row.meta_parcial} badge /></td>
      <td style={td()}>{fmtR(row.venda_jul25)}</td>
      <td style={{ ...td(), textAlign: 'center' }}><Evol v={row.evol_yoy} /></td>
      <td style={{ ...td(), textAlign: 'center' }}><Evol v={row.evol_mom} /></td>
      <td style={{ ...td(), minWidth: 110 }}>
        <Part pct26={row.pct_ecomm_jul26} pct25={row.pct_ecomm_jul25} labelAno={labelAtualAno} />
      </td>
    </tr>
  );
}

// ── Linha de Grupo/Linha (aba Categorias) ───────────────────────────────────
function CatRow({ row, depth, expanded, hasChildren, onToggle, labelAtualAno }) {
  const bgRow = depth === 0 ? 'rgba(15,32,80,0.04)' : 'transparent';
  return (
    <tr
      style={{ borderBottom: '1px solid #e9eef4', background: bgRow, transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = bgRow; }}
    >
      <td style={{ padding: '9px 12px 9px 0', paddingLeft: 12 + depth * 22, whiteSpace: 'nowrap', minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {hasChildren ? (
            <button onClick={onToggle} style={{
              width: 18, height: 18, borderRadius: 3,
              border: '1px solid #1e3a8a',
              background: expanded ? '#1e3a8a' : '#fff',
              color: expanded ? '#fff' : '#1e3a8a',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, lineHeight: 1, flexShrink: 0,
            }}>
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block', flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: depth === 0 ? 13 : 12,
            fontWeight: depth === 0 ? 700 : 400,
            color: depth === 0 ? '#0f2050' : '#475569',
          }}>
            {row.nome}
          </span>
        </div>
      </td>
      <td style={td()}>{fmtR(row.meta_total)}</td>
      <td style={{ ...td(), minWidth: 130 }}><MetaBar pct={row.pct_meta_total} /></td>
      <td style={td(true)}>{fmtR(row.venda_jul26)}</td>
      <td style={td()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: '#334155' }}>{fmtR(row.meta_parcial)}</span>
          <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>parcial</span>
        </div>
      </td>
      <td style={{ ...td(), minWidth: 90 }}><Desvio venda={row.venda_jul26} meta={row.meta_parcial} badge /></td>
      <td style={td()}>{fmtR(row.venda_jul25)}</td>
      <td style={{ ...td(), textAlign: 'center' }}><Evol v={row.evol_yoy} /></td>
      <td style={{ ...td(), textAlign: 'center' }}><Evol v={row.evol_mom} /></td>
      <td style={{ ...td(), minWidth: 110 }}>
        <Part pct26={row.pct_ecomm_jul26} pct25={row.pct_ecomm_jul25} labelAno={labelAtualAno} />
      </td>
    </tr>
  );
}

// ── Tabela Hierárquica ──────────────────────────────────────────────────────
function HierTable({ distritais, coordenadores, filiais, labelAtualAno, searchTerm }) {
  const [openDist, setOpenDist] = useState(new Set());
  const [openCoord, setOpenCoord] = useState(new Set());
  const tog = (set, setSet, key) =>
    setSet(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const matches = (name) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());

  // Auto-expandir se houver termo de busca correspondente aos filhos
  useEffect(() => {
    if (searchTerm) {
      const distsToOpen = new Set();
      const coordsToOpen = new Set();
      
      distritais.forEach(d => {
        const cs = coordenadores.filter(c => c.distrital === d.nome);
        cs.forEach(c => {
          const fs = filiais.filter(f => f.coordenador === c.nome);
          const anyFilMatch = fs.some(f => matches(f.nome));
          if (anyFilMatch || matches(c.nome)) {
            distsToOpen.add(d.nome);
          }
          if (anyFilMatch) {
            coordsToOpen.add(c.nome);
          }
        });
      });
      
      setOpenDist(distsToOpen);
      setOpenCoord(coordsToOpen);
    }
  }, [searchTerm, distritais, coordenadores, filiais]);

  const sorted = [...distritais]
    .filter(d => {
      if (matches(d.nome)) return true;
      const cs = coordenadores.filter(c => c.distrital === d.nome);
      return cs.some(c => matches(c.nome) || filiais.filter(f => f.coordenador === c.nome).some(f => matches(f.nome)));
    })
    .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0));

  const rows = [];

  sorted.forEach(dist => {
    const isDistOpen = openDist.has(dist.nome);
    const coords = coordenadores
      .filter(c => c.distrital === dist.nome)
      .filter(c => {
        if (matches(c.nome) || matches(dist.nome)) return true;
        const fils = filiais.filter(f => f.coordenador === c.nome);
        return fils.some(f => matches(f.nome));
      })
      .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0));

    rows.push(
      <HRow key={`d-${dist.nome}`} row={dist} depth={0} expanded={isDistOpen}
        hasChildren={coords.length > 0} onToggle={() => tog(openDist, setOpenDist, dist.nome)}
        labelAtualAno={labelAtualAno} />
    );

    if (isDistOpen) {
      coords.forEach(coord => {
        const isCoordOpen = openCoord.has(coord.nome);
        const fils = filiais
          .filter(f => f.coordenador === coord.nome)
          .filter(f => matches(f.nome) || matches(coord.nome) || matches(dist.nome))
          .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0));

        rows.push(
          <HRow key={`c-${coord.nome}`} row={coord} depth={1} expanded={isCoordOpen}
            hasChildren={fils.length > 0} onToggle={() => tog(openCoord, setOpenCoord, coord.nome)}
            labelAtualAno={labelAtualAno} />
        );

        if (isCoordOpen) {
          fils.forEach(fil =>
            rows.push(
              <HRow key={`f-${fil.nome}`} row={fil} depth={2} expanded={false}
                hasChildren={false} onToggle={null} labelAtualAno={labelAtualAno} />
            )
          );
        }
      });
    }
  });

  return <>{rows}</>;
}

// ── Tabela Grupos → Linhas ──────────────────────────────────────────────────
function CatTable({ grupos, linhas, labelAtualAno, searchTerm }) {
  const [openGrupo, setOpenGrupo] = useState(new Set());
  const tog = key =>
    setOpenGrupo(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const matches = (name) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());

  // Auto-expandir se houver correspondência de busca nos filhos
  useEffect(() => {
    if (searchTerm) {
      const gruposToOpen = new Set();
      grupos.forEach(g => {
        const ls = linhas.filter(l => l.grupo === g.nome);
        if (ls.some(l => matches(l.nome))) {
          gruposToOpen.add(g.nome);
        }
      });
      setOpenGrupo(gruposToOpen);
    }
  }, [searchTerm, grupos, linhas]);

  const sortedGrupos = [...grupos]
    .filter(g => {
      if (matches(g.nome)) return true;
      const ls = linhas.filter(l => l.grupo === g.nome);
      return ls.some(l => matches(l.nome));
    })
    .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0));

  const rows = [];

  sortedGrupos.forEach(grupo => {
    const isOpen = openGrupo.has(grupo.nome);
    const grupoLinhas = linhas
      .filter(l => l.grupo === grupo.nomeOriginal || l.grupo === grupo.nome)
      .filter(l => matches(l.nome) || matches(grupo.nome))
      .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0));

    rows.push(
      <CatRow key={`g-${grupo.nome}`} row={grupo} depth={0} expanded={isOpen}
        hasChildren={grupoLinhas.length > 0} onToggle={() => tog(grupo.nome)}
        labelAtualAno={labelAtualAno} />
    );

    if (isOpen) {
      grupoLinhas.forEach(linha =>
        rows.push(
          <CatRow key={`l-${grupo.nome}-${linha.nome}`} row={linha} depth={1}
            expanded={false} hasChildren={false} onToggle={null}
            labelAtualAno={labelAtualAno} />
        )
      );
    }
  });

  return <>{rows}</>;
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function DrillPanel({ onUpload }) {
  const [data, setData] = useState(null);
  const [rawFull, setRawFull] = useState(null); // dados sem filtro para popular opções
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noData, setNoData] = useState(false); // true quando servidor não tem planilha carregada
  const [activeTab, setActiveTab] = useState('hierarquia');
  const [showChart, setShowChart] = useState(true);
  const [chartMetric, setChartMetric] = useState('desvio');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  // Filtros
  const [fDist, setFDist] = useState('all');
  const [fCoord, setFCoord] = useState('all');
  const [fFilial, setFFilial] = useState('all');
  const [fGrupo, setFGrupo] = useState('all');
  const [fLinha, setFLinha] = useState('all');

  const hasFilter = fDist !== 'all' || fCoord !== 'all' || fFilial !== 'all' || fGrupo !== 'all' || fLinha !== 'all';
  const activeFiltersCount = [fDist, fCoord, fFilial, fGrupo, fLinha].filter(f => f !== 'all').length;

  const filters = { distrital: fDist, coordenador: fCoord, filial: fFilial, grupo: fGrupo, linha: fLinha };

  const load = useCallback(async () => {
    setLoading(true); setError(null); setNoData(false);
    try {
      // Sempre busca sem filtro para ter as opções de dropdown
      const resAll = await API.getMetas({ distrital: 'all', coordenador: 'all', filial: 'all', grupo: 'all', linha: 'all' });
      
      // Checar se o servidor ainda não tem planilha
      if (resAll.status === 'no_data') {
        setNoData(true);
        setLoading(false);
        return;
      }

      setRawFull(resAll.data);

      // Se tem filtro, busca com filtro
      if (hasFilter) {
        const res = await API.getMetas(filters);
        setData(res.data);
      } else {
        setData(resAll.data);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [fDist, fCoord, fFilial, fGrupo, fLinha]);

  useEffect(() => { load(); }, [load]);

  // Opções dos dropdowns (sempre do dado completo)
  const distOptions = useMemo(() =>
    [...new Set((rawFull?.distritoriais || []).map(d => d.nome))].sort(), [rawFull]);

  const coordOptions = useMemo(() =>
    [...new Set((rawFull?.coordenadores || [])
      .filter(c => fDist === 'all' || c.distrital === fDist)
      .map(c => c.nome))].sort(), [rawFull, fDist]);

  const filialOptions = useMemo(() => {
    const allFiliais = rawFull?.filiais || [];
    const allCoords = rawFull?.coordenadores || [];
    return [...new Set(allFiliais
      .filter(f => {
        if (fCoord !== 'all') return f.coordenador === fCoord;
        if (fDist !== 'all') {
          const coord = allCoords.find(c => c.nome === f.coordenador);
          return coord && coord.distrital === fDist;
        }
        return true;
      })
      .map(f => f.nome))].sort();
  }, [rawFull, fDist, fCoord]);

  const grupoOptions = useMemo(() =>
    [...new Set((rawFull?.grupos || []).map(g => g.nome))].sort(), [rawFull]);

  const linhaOptions = useMemo(() => {
    const allLinhas = rawFull?.linhas || [];
    return [...new Set(allLinhas
      .filter(l => fGrupo === 'all' || l.grupo === fGrupo)
      .map(l => l.nome))].sort();
  }, [rawFull, fGrupo]);

  const t = data?.filtered_total || data?.total || {};
  const labelAtual    = data?.label_mes_atual || 'Jul/26';
  const labelAtualAno = labelAtual.replace(/(\d{2})$/, m => String(Number(m) - 1).padStart(2, '0'));
  const labelAnt      = data?.label_mes_ant || 'Jun/26';

  const distritais    = data?.distritoriais || [];
  const coordenadores = data?.coordenadores || [];
  const filiais       = data?.filiais || [];
  const grupos        = data?.grupos || [];
  const linhas        = data?.linhas || [];

  const chartItems = useMemo(() => {
    let rawList = [];
    if (activeTab === 'hierarquia') {
      if (fDist === 'all') {
        rawList = distritais;
      } else if (fCoord === 'all') {
        rawList = coordenadores.filter(c => c.distrital === fDist);
      } else {
        rawList = filiais.filter(f => f.coordenador === fCoord);
      }
    } else {
      if (fGrupo === 'all') {
        rawList = grupos;
      } else {
        rawList = linhas.filter(l => l.grupo === fGrupo);
      }
    }
    return [...rawList]
      .sort((a, b) => (b.venda_jul26 || 0) - (a.venda_jul26 || 0))
      .slice(0, 15)
      .map(item => {
        const venda = item.venda_jul26 || 0;
        const meta = item.meta_parcial || 0;
        const part26 = item.pct_ecomm_jul26 != null ? item.pct_ecomm_jul26 : 0;
        const part25 = item.pct_ecomm_jul25 != null ? item.pct_ecomm_jul25 : 0;
        const diffPP = (item.pct_ecomm_jul26 != null && item.pct_ecomm_jul25 != null) ? (item.pct_ecomm_jul26 - item.pct_ecomm_jul25) : 0;
        return {
          name: item.nome.length > 18 ? item.nome.substring(0, 16) + '…' : item.nome,
          nomeOriginal: item.nome,
          venda,
          meta,
          desvio: desvioAbs(venda, meta) || 0,
          participacao: part26,
          participacao_ant: part25,
          diff_pp: diffPP,
        };
      });
  }, [activeTab, distritais, coordenadores, filiais, grupos, linhas, fDist, fCoord, fGrupo]);

  const handleChartClick = useCallback((state) => {
    if (!state || !state.activePayload || state.activePayload.length === 0) return;
    const clickedItem = state.activePayload[0].payload;
    const nome = clickedItem.nomeOriginal;

    if (activeTab === 'hierarquia') {
      if (fDist === 'all') {
        setFDist(nome);
        setFCoord('all');
        setFFilial('all');
      } else if (fCoord === 'all') {
        setFCoord(nome);
        setFFilial('all');
      } else if (fFilial === 'all') {
        setFFilial(nome);
      }
    } else {
      if (fGrupo === 'all') {
        setFGrupo(nome);
        setFLinha('all');
      } else if (fLinha === 'all') {
        setFLinha(nome);
      }
    }
  }, [activeTab, fDist, fCoord, fFilial, fGrupo, fLinha]);

  const tDesvio   = desvioAbs(t.venda_jul26, t.meta_parcial);
  const tPartEvol = (t.pct_ecomm_jul26 != null && t.pct_ecomm_jul25 != null) ? t.pct_ecomm_jul26 - t.pct_ecomm_jul25 : null;

  const COLS_HIER = [
    'Meta Total',
    '% Meta Total',
    `Venda E-comm\n${labelAtual}`,
    `Meta Parcial\n${labelAtual}`,
    'Desvio da Meta',
    `Venda\n${labelAtualAno}`,
    `Evolução\nYoY vs ${labelAtualAno}`,
    `Crescimento\nMoM vs ${labelAnt}`,
    'Part. Digital',
  ];

  const COLS_CAT = [
    'Meta Total',
    '% Meta Total',
    `Venda E-comm\n${labelAtual}`,
    `Meta Parcial\n${labelAtual}`,
    'Desvio da Meta',
    `Venda\n${labelAtualAno}`,
    `Evolução\nYoY vs ${labelAtualAno}`,
    `Crescimento\nMoM vs ${labelAnt}`,
    'Part. Digital',
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Topbar ── */}
      <div style={{
        background: '#0f2050', color: '#fff', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      }}>
        {/* Linha 1: título e botões */}
        <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 6, background: '#e91e8c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, color: '#fff',
            }}>SJ</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Dashboard E-Commerce — Diretoria L</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {data?.arquivo || 'base Dashboard.xlsx'} · {labelAtual}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              title={showFilters ? "Esconder Filtros" : "Mostrar Filtros"} 
              style={{ 
                ...btnS, 
                background: showFilters ? 'rgba(123,97,255,0.25)' : 'rgba(255,255,255,0.1)', 
                borderColor: showFilters ? 'rgba(123,97,255,0.5)' : 'rgba(255,255,255,0.2)',
                color: showFilters ? '#c4b5fd' : '#fff'
              }}
            >
              <Filter size={13} /> {showFilters ? 'Esconder Filtros' : 'Filtros'} {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
            </button>
            {onUpload && (
              <button onClick={onUpload} style={btnS}>
                <Upload size={13} /> Atualizar Excel
              </button>
            )}
            <button onClick={load} title="Recarregar" style={{ ...btnS, padding: '5px 8px' }}>
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {/* Linha 2: Filtros */}
        {showFilters && (
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 16,
            paddingBottom: 10, paddingTop: 4, flexWrap: 'wrap',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.4)', marginRight: 4 }}>
              Filtros:
            </span>
            <FilterSelect
              label="Distrital"
              value={fDist}
              options={distOptions}
              onChange={v => { setFDist(v); setFCoord('all'); setFFilial('all'); }}
            />
            <FilterSelect
              label="Coordenação"
              value={fCoord}
              options={coordOptions}
              disabled={distOptions.length === 0}
              onChange={v => { setFCoord(v); setFFilial('all'); }}
            />
            <FilterSelect
              label="Filial"
              value={fFilial}
              options={filialOptions}
              disabled={coordOptions.length === 0 && distOptions.length === 0}
              onChange={v => setFFilial(v)}
            />
            <FilterSelect
              label="Grupo"
              value={fGrupo}
              options={grupoOptions}
              onChange={v => { setFGrupo(v); setFLinha('all'); }}
            />
            <FilterSelect
              label="Linha"
              value={fLinha}
              options={linhaOptions}
              disabled={linhaOptions.length === 0}
              onChange={v => setFLinha(v)}
            />
            {hasFilter && (
              <button
                onClick={() => { setFDist('all'); setFCoord('all'); setFFilial('all'); setFGrupo('all'); setFLinha('all'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#fca5a5', borderRadius: 6, padding: '5px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 0, alignSelf: 'flex-end',
                }}
              >
                <X size={11} /> Limpar filtros
              </button>
            )}

            {/* Chips de filtro ativo */}
            {hasFilter && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
                {fDist !== 'all' && <span style={chip}>{fDist}</span>}
                {fCoord !== 'all' && <span style={chip}>{fCoord}</span>}
                {fFilial !== 'all' && <span style={chip}>{fFilial}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 24px', maxWidth: 1700, margin: '0 auto' }}>

        {/* ── KPIs ── */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '6px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', textAlign: 'right' }}>
            Período: <strong style={{ color: '#0f2050' }}>{labelAtual}</strong>
            &nbsp;·&nbsp; vs Ano Ant.: <strong>{labelAtualAno}</strong>
            &nbsp;·&nbsp; vs Mês Ant.: <strong>{labelAnt}</strong>
            {hasFilter && <span style={{ marginLeft: 12, color: '#7c3aed', fontWeight: 700 }}>• Dados filtrados</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <KpiBlock 
              label={`Venda E-commerce`} 
              value={loading ? '...' : fmtR(t.venda_jul26)} 
              evol={t.evol_yoy} 
              evolLabel="YoY"
              sub={`Mês Ant.: ${fmtR(t.venda_jun26)} (${fmtEvol(t.evol_mom)} MoM)`}
            />
            <KpiBlock 
              label="Meta Total" 
              value={loading ? '...' : fmtR(t.meta_total)} 
              sub={`Atingido: ${fmtPct(t.pct_meta_total)}`}
            />
            <KpiBlock 
              label="Desvio Meta Parcial" 
              value={loading ? '...' : (tDesvio != null ? (tDesvio >= 0 ? '+' : '') + fmtR(tDesvio) : '—')} 
              evol={desvioPct(t.venda_jul26, t.meta_parcial)} 
              evolLabel="desvio"
              sub={`Meta Parcial: ${fmtR(t.meta_parcial)}`}
              highlight 
            />
            <KpiBlock 
              label="Participação Digital" 
              value={loading ? '...' : fmtPct(t.pct_ecomm_jul26)} 
              evol={tPartEvol} 
              evolLabel="p.p. YoY"
              sub={`Ano Anterior: ${fmtPct(t.pct_ecomm_jul25)}`}
            />
          </div>
        </div>

        {/* ── Erro ── */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
            Erro: {error} · <button onClick={load} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Tentar novamente</button>
          </div>
        )}

        {/* ── Sem Dados — Aguardando Upload ── */}
        {noData && !loading && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '2px dashed #cbd5e1',
            padding: '60px 32px', marginBottom: 16, textAlign: 'center',
            animation: 'fadeIn 0.3s ease-out',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📂</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f2050', margin: '0 0 8px' }}>
              Nenhuma planilha carregada
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              O servidor ainda não possui dados reais. Faça o upload da planilha 
              <strong> BASE DASHBOARD</strong> pelo botão abaixo para começar a usar o dashboard.
            </p>
            <button
              onClick={onUpload}
              style={{
                background: '#e91e8c', color: '#fff', border: 'none',
                borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 12px rgba(233,30,140,0.3)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 16px rgba(233,30,140,0.4)'; }}
              onMouseOut={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 4px 12px rgba(233,30,140,0.3)'; }}
            >
              <Upload size={16} /> Fazer Upload da Planilha
            </button>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 20 }}>
              💡 Arquivo esperado: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>base Dashboard.xlsx</code> com aba <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>BASE DASHBOARD</code>
            </p>
          </div>
        )}


        {showChart && !loading && chartItems.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f2050', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📊 Análise Gráfica — {activeTab === 'hierarquia' ? 'Estrutura Organizacional' : 'Categorias & Linhas'} (Top 15 por Venda)
              </h4>
              
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Seletor de Métrica */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
                  {[
                    { key: 'desvio', label: 'Desvio (R$)' },
                    { key: 'venda_meta', label: 'Venda vs Meta' },
                    { key: 'participacao', label: 'Part. Digital (%)' },
                  ].map(m => (
                    <button
                      key={m.key}
                      onClick={() => setChartMetric(m.key)}
                      style={{
                        background: chartMetric === m.key ? '#fff' : 'transparent',
                        border: 'none',
                        color: chartMetric === m.key ? '#0f2050' : '#64748b',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: chartMetric === m.key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => setShowChart(false)} 
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <X size={12} /> Ocultar Gráfico
                </button>
              </div>
            </div>
            {chartMetric === 'venda_meta' && (
              <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#7c3aed', display: 'inline-block' }} /> Venda E-comm ({labelAtual})
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#94a3b8', display: 'inline-block' }} /> Meta Parcial
                </span>
              </div>
            )}
            {chartMetric === 'participacao' && (
              <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0ea5e9', display: 'inline-block' }} /> Part. Digital ({labelAtual})
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#94a3b8', display: 'inline-block' }} /> Part. Digital Ano Ant. ({labelAtualAno})
                </span>
              </div>
            )}
            <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ width: '100%', minWidth: 640, height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartItems} margin={{ top: 32, right: 10, left: 10, bottom: 5 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#64748b" interval={0} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} stroke="#64748b" tickFormatter={v => chartMetric === 'participacao' ? `${v.toFixed(0)}%` : fmtR(v)} tickLine={false} />
                    <Tooltip 
                      formatter={(value, name, props) => {
                        if (name === 'participacao' || name === 'Part. Digital Atual') {
                          const diff = props?.payload?.diff_pp;
                          const diffTxt = diff != null ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')} pp vs ano ant.)` : '';
                          return [`${Number(value).toFixed(1).replace('.', ',')}%${diffTxt}`, `Part. Digital (${labelAtual})`];
                        }
                        if (name === 'participacao_ant' || name === 'Part. Digital Ano Ant.') {
                          return [`${Number(value).toFixed(1).replace('.', ',')}%`, `Part. Digital Ano Ant. (${labelAtualAno})`];
                        }
                        if (name === 'venda' || name === 'Venda E-commerce') return [fmtR(value), `Venda E-comm (${labelAtual})`];
                        if (name === 'meta' || name === 'Meta Parcial') return [fmtR(value), 'Meta Parcial'];
                        return [fmtR(value), 'Desvio da Meta Parcial'];
                      }}
                      contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: 6, fontSize: 10, color: '#fff' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                    />
                    
                    {chartMetric === 'desvio' && (
                      <Bar dataKey="desvio" radius={[4, 4, 0, 0]}>
                        {chartItems.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.desvio >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                        <LabelList content={renderCustomLabel} />
                      </Bar>
                    )}

                    {chartMetric === 'venda_meta' && (
                      <Bar dataKey="venda" name="venda" fill="#7c3aed" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="venda" position="top" formatter={v => fmtR(v)} style={{ fontSize: 8, fill: '#475569', fontWeight: 600 }} />
                      </Bar>
                    )}
                    {chartMetric === 'venda_meta' && (
                      <Bar dataKey="meta" name="meta" fill="#94a3b8" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="meta" position="top" formatter={v => fmtR(v)} style={{ fontSize: 8, fill: '#475569', fontWeight: 600 }} />
                      </Bar>
                    )}

                    {chartMetric === 'participacao' && (
                      <Bar dataKey="participacao" name="participacao" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                        <LabelList content={renderCustomPartLabel} />
                      </Bar>
                    )}
                    {chartMetric === 'participacao' && (
                      <Bar dataKey="participacao_ant" name="participacao_ant" fill="#94a3b8" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="participacao_ant" position="top" formatter={v => `${Number(v).toFixed(1).replace('.', ',')}%`} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4, fontWeight: 500 }}>
              💡 Dica: clique em qualquer barra do gráfico para aplicar o filtro correspondente.
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'hierarquia', label: 'Hierarquia — Distrital · Coord. · Filial' },
              { key: 'categorias', label: 'Grupos / Categorias → Linhas' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.5)',
                border: '1px solid #e2e8f0',
                borderBottom: activeTab === tab.key ? '1px solid #fff' : '1px solid #e2e8f0',
                borderRadius: '6px 6px 0 0',
                color: activeTab === tab.key ? '#0f2050' : '#64748b',
                position: 'relative', bottom: -1,
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          {!showChart && (
            <button 
              onClick={() => setShowChart(true)} 
              style={{
                background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px 6px 0 0',
                padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#475569',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                position: 'relative', bottom: -1, borderBottom: 'none'
              }}
            >
              📊 Mostrar Gráfico de Desvio
            </button>
          )}
        </div>

        {/* ── Tabela ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 6px 6px 6px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2050' }}>
              {activeTab === 'hierarquia' ? 'Desempenho E-Commerce — Hierarquia Organizacional' : 'Desempenho E-Commerce — Grupos e Linhas de Produtos'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '4px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 6,
                  outline: 'none', width: 140, background: '#fff', color: '#1e293b',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)', transition: 'border-color 0.15s'
                }}
              />
              <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '3px 8px', fontWeight: 600 }}>
                {activeTab === 'hierarquia'
                  ? `${distritais.length} distritais`
                  : `${grupos.length} grupos`}
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={th('left', 200)}>
                    {activeTab === 'hierarquia' ? 'Distrital / Coordenador / Filial' : 'Grupo / Linha'}
                  </th>
                  {(activeTab === 'hierarquia' ? COLS_HIER : COLS_CAT).map((c, i) => (
                    <th key={i} style={th('right')}>
                      {c.split('\n').map((l, j) => <div key={j} style={{ lineHeight: 1.3 }}>{l}</div>)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {Array.from({ length: activeTab === 'hierarquia' ? 9 : 8 }).map((_, j) => (
                        <td key={j} style={{ padding: 12 }}>
                          <div style={{ height: 13, borderRadius: 3, background: '#f1f5f9', opacity: 0.7 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : activeTab === 'hierarquia' ? (
                  distritais.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      Nenhum dado disponível. Carregue um arquivo Excel atualizado.
                    </td></tr>
                  ) : (
                    <HierTable
                      distritais={distritais}
                      coordenadores={coordenadores}
                      filiais={filiais}
                      labelAtualAno={labelAtualAno}
                      searchTerm={searchTerm}
                    />
                  )
                ) : (
                  grupos.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Sem dados de categorias.</td></tr>
                  ) : (
                    <CatTable grupos={grupos} linhas={linhas} labelAtualAno={labelAtualAno} searchTerm={searchTerm} />
                  )
                )}
              </tbody>

              {/* Totais */}
              {!loading && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <td style={{ padding: '10px 12px 10px 16px', fontWeight: 800, color: '#0f2050', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      TOTAL GERAL
                    </td>
                    <td style={td()}>{fmtR(t.meta_total)}</td>
                    <td style={{ ...td(), minWidth: 130 }}><MetaBar pct={t.pct_meta_total} /></td>
                    <td style={td(true)}>{fmtR(t.venda_jul26)}</td>
                    <td style={td()}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#334155' }}>{fmtR(t.meta_parcial)}</span>
                        <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>parcial</span>
                      </div>
                    </td>
                    <td style={{ ...td(), minWidth: 90 }}><Desvio venda={t.venda_jul26} meta={t.meta_parcial} /></td>
                    <td style={td()}>{fmtR(t.venda_jul25)}</td>
                    <td style={{ ...td(), textAlign: 'center' }}><Evol v={t.evol_yoy} /></td>
                    <td style={{ ...td(), textAlign: 'center' }}><Evol v={t.evol_mom} /></td>
                    <td style={{ ...td(), minWidth: 110 }}>
                      <Part pct26={t.pct_ecomm_jul26} pct25={t.pct_ecomm_jul25} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {!loading && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8', background: '#fafafa' }}>
              {activeTab === 'hierarquia'
                ? '💡 Clique no + ao lado do nome para expandir a hierarquia: Distrital → Coordenação → Filial'
                : '💡 Clique no + ao lado do grupo para ver as Linhas de Produto dentro de cada Grupo'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Estilos base ─────────────────────────────────────────────────────────────
const td = (bold) => ({
  padding: '9px 12px', textAlign: 'right', fontSize: 12,
  fontWeight: bold ? 700 : 400, color: bold ? '#0f2050' : '#475569',
  verticalAlign: 'middle', whiteSpace: 'nowrap',
});
const th = (align = 'right', minW) => ({
  padding: '9px 12px', textAlign: align, fontSize: 10,
  fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
  letterSpacing: '0.05em', whiteSpace: 'nowrap', minWidth: minW,
});
const btnS = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 6, padding: '5px 12px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const chip = {
  fontSize: 11, fontWeight: 600,
  background: 'rgba(123,97,255,0.2)', border: '1px solid rgba(123,97,255,0.4)',
  color: '#c4b5fd', borderRadius: 4, padding: '2px 8px',
};
