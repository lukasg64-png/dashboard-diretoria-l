import React from 'react';

export default function FilterBar({ filters, options, onChange, loading }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label">Distrital</label>
        <select
          className="filter-select"
          value={filters.distrital || 'all'}
          onChange={e => onChange({ ...filters, distrital: e.target.value, coordenador: 'all', filial: 'all' })}
          disabled={loading}
        >
          <option value="all">Todos os Distritais</option>
          {(options.distritoriais || []).map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Coordenador</label>
        <select
          className="filter-select"
          value={filters.coordenador || 'all'}
          onChange={e => onChange({ ...filters, coordenador: e.target.value, filial: 'all' })}
          disabled={loading}
        >
          <option value="all">Todos os Coordenadores</option>
          {(options.coordenadores || []).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Filial</label>
        <select
          className="filter-select"
          value={filters.filial || 'all'}
          onChange={e => onChange({ ...filters, filial: e.target.value })}
          disabled={loading}
        >
          <option value="all">Todas as Filiais</option>
          {(options.filiais || []).map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {(filters.distrital !== 'all' || filters.coordenador !== 'all' || filters.filial !== 'all') && (
        <button
          className="filter-clear"
          onClick={() => onChange({ distrital: 'all', coordenador: 'all', filial: 'all' })}
        >
          ✕ Limpar
        </button>
      )}
    </div>
  );
}
