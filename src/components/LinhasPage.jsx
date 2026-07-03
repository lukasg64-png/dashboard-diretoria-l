import React, { useState, useEffect } from 'react';
import DataTable from './DataTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import API from '../api';

const SUCCESS = '#22C55E';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';

function formatK(v) {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatK(p.value)}</p>
      ))}
    </div>
  );
}

export default function LinhasPage({ filters }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topN, setTopN] = useState(20);

  useEffect(() => {
    setLoading(true);
    API.getDetalhes(filters).then(res => {
      setData(res);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [filters]);

  const labelMesAtual = data?.label_mes_atual || 'Jul/26';
  const labelMesAtualAnoAnt = data?.label_mes_atual ? data.label_mes_atual.replace(/26$/, '25').replace(/2026$/, '2025') : 'Jul/25';
  const labelMesAnt = data?.label_mes_ant || 'Jun/26';

  const cols = [
    {
      key: 'nome', label: 'Linha', width: '260px',
      render: v => <span className="bold-text">{v}</span>,
    },
    { key: 'grupos', label: 'Grupos', align: 'right' },
    {
      key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right',
      render: v => <strong>{formatK(v)}</strong>,
    },
    {
      key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right',
      render: v => formatK(v),
    },
    {
      key: 'meta_total', label: 'Meta', align: 'right',
      render: v => formatK(v),
    },
    {
      key: 'pct_meta_total', label: '% Meta', align: 'right', width: '140px',
      type: 'progress',
      valueClass: v => (v >= 90 ? 'val-green' : v >= 60 ? 'val-yellow' : 'val-red'),
    },
    {
      key: 'desvio', label: 'Desvio da Meta', align: 'right',
      render: (_, row) => {
        const venda = row.venda_jul26;
        const meta = row.meta_parcial;
        if (venda == null || meta == null) return '—';
        const abs = venda - meta;
        const pctVal = meta !== 0 ? (abs / meta) * 100 : 0;
        const color = abs >= 0 ? 'var(--success)' : 'var(--danger)';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'right' }}>
            <span style={{ fontWeight: 700, color }}>{abs >= 0 ? '+' : ''}{formatK(abs)}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(pctVal >= 0 ? '+' : '') + pctVal.toFixed(1) + '%'}</span>
          </div>
        );
      }
    },
    {
      key: 'pct_ecomm_jul26', label: 'Part. Digital', align: 'right', width: '130px',
      render: (_, row) => {
        const pct26 = row.pct_ecomm_jul26;
        const pct25 = row.pct_ecomm_jul25;
        const evol = (pct26 != null && pct25 != null) ? pct26 - pct25 : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'right' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{pct26 ? pct26.toFixed(1) + '%' : '0.0%'}</span>
            {evol != null && (
              <span style={{ fontSize: '10px', color: evol >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {(evol >= 0 ? '+' : '') + evol.toFixed(1)} p.p.
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: 'evol_yoy', label: 'Evolução YoY', align: 'right',
      valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : ''),
    },
    {
      key: 'evol_mom', label: 'Crescimento MoM', align: 'right',
      valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : ''),
    },
  ];

  const rows = (data?.linhas || []).map((l, i) => ({ ...l, _key: l.nome + i }));

  const chartData = rows.slice(0, topN).map(l => ({
    nome: l.nome.length > 22 ? l.nome.substring(0, 20) + '…' : l.nome,
    [`Venda ${labelMesAtual}`]: l.venda_jul26,
    cor: l.pct_meta_total >= 90 ? SUCCESS : l.pct_meta_total >= 60 ? WARNING : DANGER,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🏷️ Detalhamento por Linhas</h1>
        <p className="page-subtitle">
          {data ? `${data.linhas?.length || 0} linhas` : 'Carregando…'}
        </p>
      </div>

      <div className="chart-card" style={{ marginBottom: '24px' }}>
        <div className="chart-header-row">
          <h3 className="chart-title">Top {topN} Linhas — Venda {labelMesAtual}</h3>
          <div className="topn-controls">
            <label>Mostrar:</label>
            <select value={topN} onChange={e => setTopN(Number(e.target.value))} className="filter-select" style={{ width: 'auto' }}>
              <option value={15}>Top 15</option>
              <option value={20}>Top 20</option>
              <option value={30}>Top 30</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(200, topN * 16)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" width={200} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={`Venda ${labelMesAtual}`} radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable
        title="Todas as Linhas"
        columns={cols}
        data={rows}
        loading={loading}
        defaultSortCol="venda_jul26"
        pageSize={25}
        emptyMsg={error || 'Nenhuma linha encontrada'}
      />
    </div>
  );
}
