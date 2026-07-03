import React from 'react';

function formatNum(v, decimals = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${formatNum(v, 1)}%`;
}

export default function KPICard({ title, value, sub, subLabel, trend, trendLabel, color, loading, icon: Icon }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;
  const neutral = trend === 0 || trend === undefined;

  const trendColor = neutral ? 'var(--text-muted)' : isPositive ? 'var(--success)' : 'var(--danger)';
  const trendArrow = neutral ? '→' : isPositive ? '↑' : '↓';

  return (
    <div className={`kpi-card ${loading ? 'loading' : ''}`} style={{ '--accent': color || 'var(--accent)' }}>
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {Icon && <Icon size={18} className="kpi-icon" />}
      </div>
      {loading ? (
        <div className="kpi-skeleton" />
      ) : (
        <>
          <div className="kpi-value">{value}</div>
          {sub !== undefined && (
            <div className="kpi-sub">
              <span className="kpi-sub-label">{subLabel}</span>
              <span className="kpi-sub-value">{sub}</span>
            </div>
          )}
          {trend !== undefined && (
            <div className="kpi-trend" style={{ color: trendColor }}>
              <span className="kpi-trend-arrow">{trendArrow}</span>
              <span className="kpi-trend-value">{formatPct(Math.abs(trend))}</span>
              {trendLabel && <span className="kpi-trend-label">{trendLabel}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
