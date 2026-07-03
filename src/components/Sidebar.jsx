import React from 'react';
import { LayoutDashboard, BarChart3, Building2, Users, Map, TrendingUp, Database } from 'lucide-react';

const NAV = [
  { id: 'dashboard',     label: '📊 Painel Geral',    icon: LayoutDashboard },
  { id: 'categorias',    label: '📦 Categorias',      icon: BarChart3 },
  { id: 'linhas',        label: '🏷️ Linhas',           icon: TrendingUp },
  { id: 'filiais',       label: '🏪 Filiais',          icon: Building2 },
];

export default function Sidebar({ page, onNavigate, data }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Database size={22} />
        <span>Dashboard C</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-btn ${page === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {data && (
        <div className="sidebar-meta">
          <div className="meta-label">Arquivo</div>
          <div className="meta-value">{data.arquivo || '—'}</div>
          <div className="meta-label">Atualizado</div>
          <div className="meta-value">
            {data.lido_em ? new Date(data.lido_em).toLocaleString('pt-BR') : '—'}
          </div>
        </div>
      )}
    </aside>
  );
}
