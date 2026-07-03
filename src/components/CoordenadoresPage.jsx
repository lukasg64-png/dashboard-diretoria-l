import React from 'react';
import DataTable from './DataTable';

const SUCCESS = '#22C55E';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';

function formatK(v) {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export default function CoordenadoresPage({ data, loading, onRowClick }) {
  const labelMesAtual = data?.label_mes_atual || 'Jul/26';
  const labelMesAtualAnoAnt = data?.label_mes_atual ? data.label_mes_atual.replace(/26$/, '25').replace(/2026$/, '2025') : 'Jul/25';
  const labelMesAnt = data?.label_mes_ant || 'Jun/26';

  const cols = [
    {
      key: 'nome', label: 'Coordenador', width: '200px',
      render: v => <span className="bold-text">{v}</span>,
    },
    {
      key: 'distrital', label: 'Distrital', width: '160px',
      render: v => <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{v}</span>,
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

  const rows = (data?.coordenadores || []).map((c, i) => ({ ...c, _key: c.nome + i }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">👥 Coordenadores</h1>
        <p className="page-subtitle">
          {data ? `${data.coordenadores?.length || 0} coordenadores` : 'Carregando…'}
        </p>
      </div>

      <DataTable
        title="Visão por Coordenador"
        subtitle="Clique em uma linha para filtrar por coordenador"
        columns={cols}
        data={rows}
        loading={loading}
        defaultSortCol="venda_jul26"
        pageSize={25}
        onRowClick={row => onRowClick && onRowClick({ coordenador: row.nome })}
      />
    </div>
  );
}
