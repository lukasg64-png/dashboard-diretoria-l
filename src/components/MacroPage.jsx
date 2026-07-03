import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import KPICard from './KPICard';
import DataTable from './DataTable';
import { Target, TrendingUp, TrendingDown, ShoppingCart, Calendar, DollarSign, PieChart } from 'lucide-react';

const SUCCESS = '#22C55E';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';

function formatK(v) {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function TooltipChart({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? (Math.abs(p.value) >= 1000 ? formatK(p.value) : p.value.toFixed(2)) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function MacroPage({ data, loading, onRowClick }) {
  const t = data?.filtered_total || data?.total || {};
  const rows = data?.distritoriais || [];

  const labelMesAtual = data?.label_mes_atual || 'Jul/26';
  const labelMesAtualAnoAnt = data?.label_mes_atual ? data.label_mes_atual.replace(/26$/, '25').replace(/2026$/, '2025') : 'Jul/25';
  const labelMesAnt = data?.label_mes_ant || 'Jun/26';

  const tableCols = [
    {
      key: 'nome', label: 'Distrital', width: '200px',
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
      key: 'venda_jun26', label: `Venda ${labelMesAnt}`, align: 'right',
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

  const chartD = rows.slice(0, 8).map(d => ({
    nome:  d.nome.length > 14 ? d.nome.substring(0, 12) + '…' : d.nome,
    [labelMesAtual]: d.venda_jul26,
    [labelMesAtualAnoAnt]: d.venda_jul25,
    cor:   d.pct_meta_total >= 90 ? SUCCESS : d.pct_meta_total >= 60 ? WARNING : DANGER,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📊 Dashboard Macro — Diretoria C</h1>
        <p className="page-subtitle">
          Comparativo de meta, mês anterior e ano anterior
          {data?.arquivo && <span className="header-file"> · {data.arquivo}</span>}
        </p>
      </div>

      {/* Storytelling Section */}
      <div className="storytelling-section" style={{ marginBottom: 24 }}>
        <h3 className="section-title" style={{ marginBottom: 16, color: 'var(--text)', fontSize: '1.2rem' }}>Resumo E-commerce</h3>
        <div className="kpi-grid">
          <KPICard title={`Venda E-commerce (${labelMesAtual})`} value={formatK(t.venda_jul26)}
            sub={formatK(t.meta_total)} subLabel="Meta Total:"
            trend={t.evol_yoy} trendLabel={`vs ${labelMesAtualAnoAnt}`}
            color="#7B61FF" loading={loading} icon={ShoppingCart} />
          <KPICard title="Atingimento Meta Parcial" value={`${(t.pct_meta_parcial||0).toFixed(1)}%`}
            sub={formatK(t.meta_parcial)} subLabel="Meta Parcial:"
            color={t.pct_meta_parcial >= 90 ? SUCCESS : t.pct_meta_parcial >= 60 ? WARNING : DANGER}
            loading={loading} icon={Target} />
          <KPICard title="Desvio Meta Parcial" 
            value={t.venda_jul26 != null && t.meta_parcial != null ? `${(t.venda_jul26 - t.meta_parcial) >= 0 ? '+' : ''}${formatK(t.venda_jul26 - t.meta_parcial)}` : '—'}
            trend={t.meta_parcial ? ((t.venda_jul26 - t.meta_parcial) / t.meta_parcial) * 100 : undefined}
            trendLabel="desvio"
            color={t.venda_jul26 >= t.meta_parcial ? SUCCESS : DANGER}
            loading={loading}
            icon={t.venda_jul26 >= t.meta_parcial ? TrendingUp : TrendingDown} />
          <KPICard title="Evolução YoY" value={`${t.evol_yoy>=0?'+':''}${(t.evol_yoy||0).toFixed(1)}%`}
            sub={`${labelMesAtualAnoAnt}: ${formatK(t.venda_jul25)}`} subLabel={`Venda ${labelMesAtualAnoAnt}:`}
            color={t.evol_yoy >= 0 ? SUCCESS : DANGER}
            loading={loading} icon={t.evol_yoy >= 0 ? TrendingUp : TrendingDown} />
          <KPICard title="Crescimento MoM" value={`${t.evol_mom>=0?'+':''}${(t.evol_mom||0).toFixed(1)}%`}
            sub={`${labelMesAnt}: ${formatK(t.venda_jun26)}`} subLabel={`Venda ${labelMesAnt}:`}
            color={t.evol_mom >= 0 ? SUCCESS : DANGER}
            loading={loading} icon={t.evol_mom >= 0 ? TrendingUp : TrendingDown} />
        </div>
        
        <h3 className="section-title" style={{ marginTop: 24, marginBottom: 16, color: 'var(--text)', fontSize: '1.2rem' }}>Participação na Rede</h3>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <KPICard title="Venda Total da Rede" value={formatK(t.base_emp_jul26)}
            sub={`${labelMesAtualAnoAnt}: ${formatK(t.base_emp_jul25)}`} subLabel={`Venda ${labelMesAtualAnoAnt}:`}
            color="#3B82F6"
            loading={loading} icon={DollarSign} />
          <KPICard title="Participação E-commerce" value={`${(t.pct_ecomm_jul26||0).toFixed(1)}%`}
            sub={`${labelMesAtualAnoAnt}: ${(t.pct_ecomm_jul25||0).toFixed(1)}%`} subLabel={`Part. ${labelMesAtualAnoAnt}:`}
            trend={(t.pct_ecomm_jul26||0) - (t.pct_ecomm_jul25||0)} trendLabel={`p.p. vs ${labelMesAtualAnoAnt}`}
            color="#F59E0B"
            loading={loading} icon={PieChart} />
        </div>
      </div>

      {/* Gráfico distritais */}
      {chartD.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 24 }}>
          <h3 className="chart-title">Vendas {labelMesAtual} vs {labelMesAtualAnoAnt} — por Distrital</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartD} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
              <Tooltip content={<TooltipChart />} />
              <Legend />
              <Bar dataKey={labelMesAtual} radius={[4,4,0,0]}>
                {chartD.map((e,i) => <Cell key={i} fill={e.cor} />)}
              </Bar>
              <Bar dataKey={labelMesAtualAnoAnt} fill="var(--border)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <DataTable
        title="Visão por Distrital"
        columns={tableCols}
        data={rows.map((d, i) => ({ ...d, _key: d.nome + i }))}
        loading={loading}
        defaultSortCol="venda_jul26"
        onRowClick={row => onRowClick && onRowClick({ distrital: row.nome })}
      />
    </div>
  );
}
