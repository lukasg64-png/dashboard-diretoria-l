import React from 'react';
import './App.css';
import CuponsPage from './components/CuponsPage';

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Topbar ── */}
      <div style={{
        background: '#0f2050', color: '#fff', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      }}>
        <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6, background: '#e91e8c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: '#fff',
            }}>SJ</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Dashboard E-Commerce — Diretoria L</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                Acompanhamento de Cupons VTEX em Tempo Real
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Conteúdo Cupons ── */}
      <div style={{ padding: '20px 24px' }}>
        <CuponsPage />
      </div>
    </div>
  );
}

export default App;
