import React, { useState } from 'react';

function formatNum(v, decimals = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SortIcon({ col, sortCol, sortDir }) {
  if (col !== sortCol) return <span className="sort-icon neutral">↕</span>;
  return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function ProgressBar({ value, max = 100 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color }} />
      <span className="progress-bar-label">{formatNum(pct, 1)}%</span>
    </div>
  );
}

export default function DataTable({ columns, data, defaultSortCol, defaultSortDir = 'desc', title, subtitle, onRowClick, loading, pageSize = 20, emptyMsg = 'Nenhum dado encontrado' }) {
  const [sortCol, setSortCol] = useState(defaultSortCol || (columns[0]?.key));
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [page, setPage] = useState(1);

  function handleSort(key) {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function sortRows(rows) {
    return [...rows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  const sorted = sortRows(data || []);
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="data-table-wrap">
      {(title || subtitle) && (
        <div className="table-header">
          {title && <h3 className="table-title">{title}</h3>}
          {subtitle && <span className="table-subtitle">{subtitle}</span>}
        </div>
      )}
      {loading ? (
        <div className="table-loading">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton-row" />)}
        </div>
      ) : paginated.length === 0 ? (
        <div className="table-empty">{emptyMsg}</div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      className={`th-${col.align || 'left'} ${col.sortable !== false ? 'sortable' : ''} ${col.key === sortCol ? 'sorted' : ''}`}
                      style={{ width: col.width }}
                      onClick={() => col.sortable !== false && handleSort(col.key)}
                    >
                      {col.label}
                      {col.sortable !== false && <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((row, idx) => (
                  <tr
                    key={row._key || idx}
                    className={onRowClick ? 'clickable' : ''}
                    onClick={() => onRowClick && onRowClick(row)}
                  >
                    {columns.map(col => (
                      <td key={col.key} className={`td-${col.align || 'left'}`}>
                        {col.render ? col.render(row[col.key], row) : (
                          col.type === 'progress' ? (
                            <ProgressBar value={row[col.key]} max={col.max ? row[col.max] : 100} />
                          ) : (
                            <span className={col.valueClass ? col.valueClass(row) : ''}>
                              {formatNum(row[col.key], col.decimals ?? 1)}
                            </span>
                          )
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="table-pagination">
              <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              <span className="page-info">Página {page} de {totalPages} ({sorted.length} registros)</span>
              <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
