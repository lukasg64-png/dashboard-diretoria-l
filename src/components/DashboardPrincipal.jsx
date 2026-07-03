import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import KPICard from './KPICard';
import DataTable from './DataTable';
import { 
  Target, TrendingUp, TrendingDown, ShoppingCart, DollarSign, PieChart, 
  Map, Users, Building2, Package, Tag, ChevronRight, Home, BarChart3 
} from 'lucide-react';

const SUCCESS = '#10B981'; // Emerald 500
const WARNING = '#F59E0B'; // Amber 500
const DANGER  = '#EF4444'; // Red 500
const ACCENT  = '#8B5CF6'; // Violet 500
const ACCENT_ALT = '#3B82F6'; // Blue 500

function formatK(v) {
  if (!v && v !== 0) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function TooltipChart({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip glassmorphism">
      <p className="tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? (Math.abs(p.value) >= 1000 ? formatK(p.value) : p.value.toFixed(2)) : p.value}
          {p.unit || ''}
        </p>
      ))}
    </div>
  );
}

export default function DashboardPrincipal({ data, loading, filters, onFilterChange }) {
  const [activeTab, setActiveTab] = useState('hierarquia'); // 'hierarquia', 'categorias', 'linhas'
  const [topNCats, setTopNCats] = useState(15);
  const [topNLines, setTopNLines] = useState(15);

  const t = data?.filtered_total || data?.total || {};
  
  // Determina nível atual
  let currentLevel = 'rede';
  if (filters.filial !== 'all') {
    currentLevel = 'filial';
  } else if (filters.coordenador !== 'all') {
    currentLevel = 'coordenador';
  } else if (filters.distrital !== 'all') {
    currentLevel = 'distrital';
  }

  // Título e Ícone do Nível Ativo
  const levelInfo = {
    rede: { title: 'Rede Geral', icon: Home, desc: 'Visão consolidada de todas as distritais' },
    distrital: { title: `Distrital: ${filters.distrital}`, icon: Map, desc: 'Filtro por distrito e seus coordenadores' },
    coordenador: { title: `Coord: ${filters.coordenador}`, icon: Users, desc: 'Filtro por coordenador e suas filiais' },
    filial: { title: `Filial: ${filters.filial}`, icon: Building2, desc: 'Filtro por filial de loja física' }
  };
  const activeLevel = levelInfo[currentLevel];

  // Limpeza de Filtros nos Breadcrumbs
  const handleResetToRede = () => {
    onFilterChange({ distrital: 'all', coordenador: 'all', filial: 'all' });
  };
  const handleResetToDistrital = () => {
    onFilterChange({ ...filters, coordenador: 'all', filial: 'all' });
  };
  const handleResetToCoordenador = () => {
    onFilterChange({ ...filters, filial: 'all' });
  };

  // ── Definições de Tabelas e Gráficos por Nível ──
  let childTableTitle = '';
  let childTableCols = [];
  let childTableRows = [];
  let childOnRowClick = null;
  let chartData = [];
  const labelMesAtual = data?.label_mes_atual || 'Jul/26';
  const labelMesAtualAnoAnt = data?.label_mes_atual ? data.label_mes_atual.replace(/26$/, '25').replace(/2026$/, '2025') : 'Jul/25';
  const labelMesAnt = data?.label_mes_ant || 'Jun/26';

  let chartYKey = `Venda ${labelMesAtual}`;
  let chartXKey = 'nome';

  if (currentLevel === 'rede') {
    childTableTitle = 'Desempenho por Distrital';
    childTableRows = data?.distritoriais || [];
    childOnRowClick = (row) => onFilterChange({ distrital: row.nome, coordenador: 'all', filial: 'all' });
    childTableCols = [
      { key: 'nome', label: 'Distrital', width: '200px', render: v => <span className="bold-text text-highlight">{v}</span> },
      { key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right', render: v => <strong>{formatK(v)}</strong> },
      { key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right', render: v => formatK(v) },
      { key: 'meta_total', label: 'Meta', align: 'right', render: v => formatK(v) },
      { key: 'pct_meta_total', label: '% Meta', align: 'right', width: '130px', type: 'progress' },
      { key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', render: v => <span className="part-ecomm-value">{v ? v.toFixed(1) + '%' : '0.0%'}</span> },
      { key: 'evol_yoy', label: 'Evolução YoY', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
      { key: 'evol_mom', label: 'Crescimento MoM', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
    ];
    chartData = childTableRows.map(d => ({
      nome: d.nome,
      [chartYKey]: d.venda_jul26,
      'Meta': d.meta_total,
      cor: d.pct_meta_total >= 90 ? SUCCESS : d.pct_meta_total >= 60 ? WARNING : DANGER
    }));
  } 
  else if (currentLevel === 'distrital') {
    childTableTitle = `Coordenadores sob ${filters.distrital}`;
    childTableRows = data?.coordenadores || [];
    childOnRowClick = (row) => onFilterChange({ ...filters, coordenador: row.nome, filial: 'all' });
    childTableCols = [
      { key: 'nome', label: 'Coordenador', width: '200px', render: v => <span className="bold-text text-highlight">{v}</span> },
      { key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right', render: v => <strong>{formatK(v)}</strong> },
      { key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right', render: v => formatK(v) },
      { key: 'meta_total', label: 'Meta', align: 'right', render: v => formatK(v) },
      { key: 'pct_meta_total', label: '% Meta', align: 'right', width: '130px', type: 'progress' },
      { key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', render: v => <span className="part-ecomm-value">{v ? v.toFixed(1) + '%' : '0.0%'}</span> },
      { key: 'evol_yoy', label: 'Evolução YoY', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
      { key: 'evol_mom', label: 'Crescimento MoM', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
    ];
    chartData = childTableRows.map(c => ({
      nome: c.nome,
      [chartYKey]: c.venda_jul26,
      'Meta': c.meta_total,
      cor: c.pct_meta_total >= 90 ? SUCCESS : c.pct_meta_total >= 60 ? WARNING : DANGER
    }));
  } 
  else if (currentLevel === 'coordenador') {
    childTableTitle = `Filiais sob ${filters.coordenador}`;
    childTableRows = data?.filiais || [];
    childOnRowClick = (row) => onFilterChange({ ...filters, filial: row.nome });
    childTableCols = [
      { key: 'nome', label: 'Filial', width: '220px', render: v => <span className="bold-text text-highlight">{v}</span> },
      { key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right', render: v => <strong>{formatK(v)}</strong> },
      { key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right', render: v => formatK(v) },
      { key: 'meta_total', label: 'Meta', align: 'right', render: v => formatK(v) },
      { key: 'pct_meta_total', label: '% Meta', align: 'right', width: '130px', type: 'progress' },
      { key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', render: v => <span className="part-ecomm-value">{v ? v.toFixed(1) + '%' : '0.0%'}</span> },
      { key: 'evol_yoy', label: 'Evolução YoY', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
      { key: 'evol_mom', label: 'Crescimento MoM', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
    ];
    chartData = childTableRows.slice(0, 15).map(f => ({
      nome: f.nome.replace('FILIAL ', 'F.'),
      [chartYKey]: f.venda_jul26,
      'Meta': f.meta_total,
      cor: f.pct_meta_total >= 90 ? SUCCESS : f.pct_meta_total >= 60 ? WARNING : DANGER
    }));
  }

  // ── Categorias & Linhas para a Visualização de Abas ──
  const categoryCols = [
    { key: 'nome', label: 'Grupo / Categoria', width: '220px', render: v => <span className="bold-text">{v}</span> },
    { key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right', render: v => <strong>{formatK(v)}</strong> },
    { key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right', render: v => formatK(v) },
    { key: 'meta_total', label: 'Meta', align: 'right', render: v => formatK(v) },
    { key: 'pct_meta_total', label: '% Meta', align: 'right', width: '130px', type: 'progress' },
    { key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', render: v => <span className="part-ecomm-value">{v ? v.toFixed(1) + '%' : '0.0%'}</span> },
    { key: 'evol_yoy', label: 'Evolução YoY', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
    { key: 'evol_mom', label: 'Crescimento MoM', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
  ];

  const lineCols = [
    { key: 'nome', label: 'Linha de Produto', width: '240px', render: v => <span className="bold-text">{v}</span> },
    { key: 'venda_jul26', label: `Venda ${labelMesAtual}`, align: 'right', render: v => <strong>{formatK(v)}</strong> },
    { key: 'venda_jul25', label: `Venda ${labelMesAtualAnoAnt}`, align: 'right', render: v => formatK(v) },
    { key: 'meta_total', label: 'Meta', align: 'right', render: v => formatK(v) },
    { key: 'pct_meta_total', label: '% Meta', align: 'right', width: '130px', type: 'progress' },
    { key: 'pct_ecomm_jul26', label: '% Part E-comm', align: 'right', render: v => <span className="part-ecomm-value">{v ? v.toFixed(1) + '%' : '0.0%'}</span> },
    { key: 'evol_yoy', label: 'Evolução YoY', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
    { key: 'evol_mom', label: 'Crescimento MoM', align: 'right', valueClass: v => (v > 0 ? 'val-green' : v < 0 ? 'val-red' : '') },
  ];

  const categoryRows = (data?.grupos || []).map((g, i) => ({ ...g, _key: g.nomeOriginal || g.nome + i }));
  const lineRows = (data?.linhas || []).map((l, i) => ({ ...l, _key: l.nome + i }));

  const categoryChartData = categoryRows.slice(0, topNCats).map(g => ({
    nome: g.nome.length > 15 ? g.nome.substring(0, 13) + '…' : g.nome,
    [chartYKey]: g.venda_jul26,
    'Meta': g.meta_total,
    cor: g.pct_meta_total >= 90 ? SUCCESS : g.pct_meta_total >= 60 ? WARNING : DANGER
  }));

  const lineChartData = lineRows.slice(0, topNLines).map(l => ({
    nome: l.nome.length > 16 ? l.nome.substring(0, 14) + '…' : l.nome,
    [chartYKey]: l.venda_jul26,
    cor: l.pct_meta_total >= 90 ? SUCCESS : l.pct_meta_total >= 60 ? WARNING : DANGER
  }));

  return (
    <div className="dashboard-principal animate-fade-in">
      
      {/* ── Breadcrumbs Premium ── */}
      <div className="breadcrumb-wrapper glassmorphism">
        <div className="breadcrumb-trail">
          <button className="breadcrumb-node" onClick={handleResetToRede}>
            <Home size={15} />
            <span>Rede</span>
          </button>
          
          {filters.distrital !== 'all' && (
            <>
              <ChevronRight size={14} className="breadcrumb-separator" />
              <button 
                className={`breadcrumb-node ${filters.coordenador === 'all' ? 'active' : ''}`}
                onClick={handleResetToDistrital}
              >
                <Map size={14} />
                <span>Distrital: {filters.distrital}</span>
              </button>
            </>
          )}

          {filters.coordenador !== 'all' && (
            <>
              <ChevronRight size={14} className="breadcrumb-separator" />
              <button 
                className={`breadcrumb-node ${filters.filial === 'all' ? 'active' : ''}`}
                onClick={handleResetToCoordenador}
              >
                <Users size={14} />
                <span>Coord: {filters.coordenador}</span>
              </button>
            </>
          )}

          {filters.filial !== 'all' && (
            <>
              <ChevronRight size={14} className="breadcrumb-separator" />
              <div className="breadcrumb-node active">
                <Building2 size={14} />
                <span>Filial: {filters.filial}</span>
              </div>
            </>
          )}
        </div>
        
        <div className="active-level-badge">
          <activeLevel.icon size={14} />
          <span>Foco: {activeLevel.title}</span>
        </div>
      </div>

      {/* ── Storytelling KPI Sections ── */}
      <div className="dashboard-story-section">
        <div className="story-group-header">
          <div className="story-title-wrap">
            <span className="story-badge ecommerce">CANAIS</span>
            <h2>Resumo E-commerce ({data?.label_mes_atual || 'Jul/26'})</h2>
          </div>
          <span className="story-context-desc">Desempenho financeiro e metas do canal digital</span>
        </div>

        <div className="kpi-grid">
          <KPICard 
            title="Venda E-commerce" 
            value={formatK(t.venda_jul26)}
            sub={formatK(t.meta_total)} 
            subLabel="Meta Total:"
            trend={t.evol_yoy} 
            trendLabel={`vs ${labelMesAtualAnoAnt}`}
            color={ACCENT} 
            loading={loading} 
            icon={ShoppingCart} 
          />
          <KPICard 
            title="Atingimento Meta Parcial" 
            value={`${(t.pct_meta_parcial || 0).toFixed(1)}%`}
            sub={formatK(t.meta_parcial)} 
            subLabel="Meta Parcial:"
            color={(t.pct_meta_parcial || 0) >= 90 ? SUCCESS : (t.pct_meta_parcial || 0) >= 60 ? WARNING : DANGER}
            loading={loading} 
            icon={Target} 
          />
          <KPICard 
            title="Desvio Meta Parcial" 
            value={t.venda_jul26 != null && t.meta_parcial != null ? `${(t.venda_jul26 - t.meta_parcial) >= 0 ? '+' : ''}${formatK(t.venda_jul26 - t.meta_parcial)}` : '—'}
            trend={t.meta_parcial ? ((t.venda_jul26 - t.meta_parcial) / t.meta_parcial) * 100 : undefined}
            trendLabel="desvio"
            color={t.venda_jul26 >= t.meta_parcial ? SUCCESS : DANGER}
            loading={loading}
            icon={t.venda_jul26 >= t.meta_parcial ? TrendingUp : TrendingDown}
          />
          <KPICard 
            title="Evolução YoY" 
            value={`${t.evol_yoy >= 0 ? '+' : ''}${(t.evol_yoy || 0).toFixed(1)}%`}
            sub={`${labelMesAtualAnoAnt}: ${formatK(t.venda_jul25)}`} 
            subLabel={`Venda ${labelMesAtualAnoAnt}:`}
            color={t.evol_yoy >= 0 ? SUCCESS : DANGER}
            loading={loading} 
            icon={t.evol_yoy >= 0 ? TrendingUp : TrendingDown} 
          />
          <KPICard 
            title="Crescimento MoM" 
            value={`${t.evol_mom >= 0 ? '+' : ''}${(t.evol_mom || 0).toFixed(1)}%`}
            sub={`${labelMesAnt}: ${formatK(t.venda_jun26)}`} 
            subLabel="Venda Anterior:"
            color={t.evol_mom >= 0 ? SUCCESS : DANGER}
            loading={loading} 
            icon={t.evol_mom >= 0 ? TrendingUp : TrendingDown} 
          />
        </div>

        <div className="story-group-header" style={{ marginTop: '24px' }}>
          <div className="story-title-wrap">
            <span className="story-badge rede">MARKET SHARE</span>
            <h2>Participação na Rede (Base Empresa)</h2>
          </div>
          <span className="story-context-desc">Quanto o e-commerce representa das vendas globais das lojas físicas</span>
        </div>

        <div className="kpi-grid part-grid">
          <KPICard 
            title="Venda Total da Rede" 
            value={formatK(t.base_emp_jul26)}
            sub={`${labelMesAtualAnoAnt}: ${formatK(t.base_emp_jul25)}`} 
            subLabel={`Rede ${labelMesAtualAnoAnt}:`}
            color={ACCENT_ALT}
            loading={loading} 
            icon={DollarSign} 
          />
          <KPICard 
            title="Participação E-commerce" 
            value={`${(t.pct_ecomm_jul26 || 0).toFixed(1)}%`}
            sub={`${labelMesAtualAnoAnt}: ${(t.pct_ecomm_jul25 || 0).toFixed(1)}%`} 
            subLabel={`Part. ${labelMesAtualAnoAnt}:`}
            trend={(t.pct_ecomm_jul26 || 0) - (t.pct_ecomm_jul25 || 0)} 
            trendLabel={`p.p. vs ${labelMesAtualAnoAnt}`}
            color={WARNING}
            loading={loading} 
            icon={PieChart} 
          />
        </div>
      </div>

      {/* ── Tabs de Navegação Analítica ── */}
      <div className="tabs-nav-wrapper">
        <div className="tabs-buttons">
          <button 
            className={`tab-trigger ${activeTab === 'hierarquia' ? 'active' : ''}`}
            onClick={() => setActiveTab('hierarquia')}
            disabled={currentLevel === 'filial'}
          >
            <BarChart3 size={16} />
            <span>Estrutura Organizacional</span>
            {currentLevel === 'filial' && <span className="tab-disabled-badge">Drill-down Final</span>}
          </button>
          
          <button 
            className={`tab-trigger ${activeTab === 'categorias' ? 'active' : ''}`}
            onClick={() => setActiveTab('categorias')}
          >
            <Package size={16} />
            <span>Desempenho por Categorias</span>
          </button>

          <button 
            className={`tab-trigger ${activeTab === 'linhas' ? 'active' : ''}`}
            onClick={() => setActiveTab('linhas')}
          >
            <Tag size={16} />
            <span>Desempenho por Linhas</span>
          </button>
        </div>
      </div>

      {/* ── Renderização das Abas ── */}
      <div className="tab-pane-content">
        
        {/* ABA 1: HIERARQUIA ORGANIZACIONAL */}
        {activeTab === 'hierarquia' && currentLevel !== 'filial' && (
          <div className="hierarquia-container animate-fade-in">
            {chartData.length > 0 && (
              <div className="chart-card">
                <div className="chart-header-row">
                  <h3 className="chart-title">
                    Metas de Faturamento ({childTableTitle.split(' ').slice(2).join(' ') || 'Subnível'})
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey={chartXKey} tick={{ fontSize: 10 }} stroke="var(--text-muted)" interval={0} angle={chartData.length > 8 ? -20 : 0} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
                    <Tooltip content={<TooltipChart />} />
                    <Legend />
                    <Bar dataKey="Venda Jul/26" radius={[4, 4, 0, 0]}>
                      {chartData.map((e, i) => <Cell key={i} fill={e.cor} />)}
                    </Bar>
                    <Bar dataKey="Meta" fill="var(--border)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <DataTable
              title={childTableTitle}
              subtitle="Dica: clique em uma linha para descer na hierarquia (Drill-down)"
              columns={childTableCols}
              data={childTableRows.map((r, i) => ({ ...r, _key: r.nome + i }))}
              loading={loading}
              defaultSortCol="venda_jul26"
              pageSize={25}
              onRowClick={childOnRowClick}
            />
          </div>
        )}

        {/* ABA 2: CATEGORIAS */}
        {activeTab === 'categorias' && (
          <div className="categorias-container animate-fade-in">
            <div className="chart-card">
              <div className="chart-header-row">
                <h3 className="chart-title">Top {topNCats} Categorias — Venda vs Meta</h3>
                <div className="topn-controls">
                  <label>Mostrar:</label>
                  <select 
                    value={topNCats} 
                    onChange={e => setTopNCats(Number(e.target.value))} 
                    className="filter-select"
                  >
                    <option value={10}>Top 10</option>
                    <option value={15}>Top 15</option>
                    <option value={20}>Top 20</option>
                    <option value={30}>Top 30</option>
                  </select>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(220, topNCats * 20)}>
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" width={120} />
                  <Tooltip content={<TooltipChart />} />
                  <Bar dataKey="Venda Jul/26" radius={[0, 4, 4, 0]}>
                    {categoryChartData.map((e, i) => <Cell key={i} fill={e.cor} />)}
                  </Bar>
                  <Bar dataKey="Meta" fill="var(--border)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <DataTable
              title="Performance de Categorias no Foco Ativo"
              columns={categoryCols}
              data={categoryRows}
              loading={loading}
              defaultSortCol="venda_jul26"
              pageSize={25}
            />
          </div>
        )}

        {/* ABA 3: LINHAS */}
        {activeTab === 'linhas' && (
          <div className="linhas-container animate-fade-in">
            <div className="chart-card">
              <div className="chart-header-row">
                <h3 className="chart-title">Top {topNLines} Linhas de Produtos</h3>
                <div className="topn-controls">
                  <label>Mostrar:</label>
                  <select 
                    value={topNLines} 
                    onChange={e => setTopNLines(Number(e.target.value))} 
                    className="filter-select"
                  >
                    <option value={10}>Top 10</option>
                    <option value={15}>Top 15</option>
                    <option value={20}>Top 20</option>
                    <option value={30}>Top 30</option>
                  </select>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(220, topNLines * 20)}>
                <BarChart data={lineChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={v => formatK(v)} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} stroke="var(--text-muted)" width={130} />
                  <Tooltip content={<TooltipChart />} />
                  <Bar dataKey="Venda Jul/26" radius={[0, 4, 4, 0]}>
                    {lineChartData.map((e, i) => <Cell key={i} fill={e.cor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <DataTable
              title="Performance de Linhas no Foco Ativo"
              columns={lineCols}
              data={lineRows}
              loading={loading}
              defaultSortCol="venda_jul26"
              pageSize={25}
            />
          </div>
        )}

        {/* MENSAGEM SE CHEGAR NO NÍVEL FILIAL NA ABA HIERARQUIA */}
        {activeTab === 'hierarquia' && currentLevel === 'filial' && (
          <div className="filial-final-prompt glassmorphism">
            <Building2 size={36} style={{ color: 'var(--accent)' }} />
            <h3>Você está visualizando a Filial {filters.filial}</h3>
            <p>
              O nível de filial é o último degrau da nossa estrutura operacional. 
              Use as abas acima <strong>"Desempenho por Categorias"</strong> ou <strong>"Desempenho por Linhas"</strong> para analisar as vendas específicas deste ponto.
            </p>
            <button className="btn-return-macro" onClick={handleResetToCoordenador}>
              Subir Nível para Coordenador
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
