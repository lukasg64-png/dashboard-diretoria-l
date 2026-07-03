import React from 'react';
import DataTable from './DataTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';

const SUCCESS = '#22C55E';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';
const ACCENT  = '#7B61FF';

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
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? (p.value >= 1000 ? formatK(p.value) : p.value.toFixed(2)) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function DistritoriaisPage({ data, loading, onRowClick }) {
  const labelMesAtual = data?.label_mes_atual || 'Jul/26';
  const labelMesAtualAnoAnt = data?.label_mes_atual ? data.label_mes_atual.replace(/26$/, '25').replace(/2026$/, '2025') : 'Jul/25';
  const labelMesAnt = data?.label_mes_ant || 'Jun/26';

  const cols = [
    {
      key: 'nome', label: 'Distrital', width: '180px',
      render: v => <span className="bold-text">{v}</span>,
    },
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
      key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', width: '130px',
      render: v => <span style={{color: 'var(--accent)', fontWeight: 500}}>{v ? v.toFixed(1) + '%' : '0.0%'}</span>,
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

  const rows = (data?.distritoriais || []).map((d, i) => ({ ...d, _key: d.nome + i }));

  // Chart data: vendas por distrital
  const chartData = rows.map(d => ({
    nome: d.nome.length > 16 ? d.nome.substring(0, 14) + '…' : d.nome,
    [`Venda ${labelMesAtual}`]: d.venda_jul26,
    Meta: d.meta_total,
    cor: d.pct_meta_total >= 90 ? SUCCESS : d.pct_meta_total >= 60 ? WARNING : DANGER,
  }));

  // Chart: participação digital por distrital
  const partData = rows.map(d => ({
    nome: d.nome.length > 16 ? d.nome.substring(0, 14) + '…' : d.nome,
    'Part. E-comm %': d.pct_ecomm_jul26 || 0,
    cor: (d.pct_ecomm_jul26 || 0) >= 5 ? SUCCESS : (d.pct_ecomm_jul26 || 0) >= 3 ? WARNING : DANGER,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🗺️ Distritoriais</h1>
        <p className="page-subtitle">
          {data ? `${data.distritoriais?.length || 0} distritais` : 'Carregando…'}
        </p>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="chart-card">
          <h3 className="chart-title"><BarChart3 size={16} style={{ display: 'inline', marginRight: 6 }} />Vendas {labelMesAtual} vs Meta</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey={`Venda ${labelMesAtual}`} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.cor} />
                ))}
              </Bar>
              <Bar dataKey="Meta" fill="var(--border)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-title"><TrendingUp size={16} style={{ display: 'inline', marginRight: 6 }} />Participação E-commerce {labelMesAtual}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={partData} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" unit="%" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Part. E-comm %" radius={[4, 4, 0, 0]}>
                {partData.map((entry, index) => (
                  <Cell key={index} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <DataTable
        title="Visão por Distrital"
        columns={cols}
        data={rows}
        loading={loading}
        defaultSortCol="venda_jul26"
        pageSize={25}
        onRowClick={row => onRowClick && onRowClick({ distrital: row.nome })}
      />
    </div>
  );
}
