# 📘 Guia Técnico: Solução Definitiva para Fuso Horário VTEX (UTC vs BRT / UTC-3)

Este documento contém o padrão técnico completo e à prova de falhas para resolver e prevenir vazamentos de fuso horário em integrações com a **API da VTEX (OMS)**, serviços backend (Node.js/Python), interfaces frontend (React/JS) e exportações de relatórios (Excel/CSV).

---

## 1. 🔍 Entendendo a Causa Raiz do Bug

1. **Padrão da VTEX API**: A VTEX armazena todas as datas e horários dos pedidos no padrão **ISO 8601 UTC (GMT+0)**, terminado com o sufixo `Z` (ex: `2026-08-13T01:30:00.000Z`).

2. **Fuso Horário do Brasil**: O horário oficial do Brasil (Brasília) opera em **BRT (UTC-3)**.

3. **O Conflito de Datas**:
   - Um pedido realizado às **22:30 no dia 12/08 (Horário de Brasília)** é gravado na VTEX como `2026-08-13T01:30:00.000Z` (**01:30 do dia 13/08 em UTC**).
   - **O Erro Comum**: Se o sistema filtrar ou comparar pelo campo UTC sem aplicar a conversão de 3 horas para BRT, compras feitas ontem à noite (21:00 às 23:59 BRT) vazam para o filtro do dia de **"Hoje"**.

---

## 2. 🛡️ Solução por Camada de Integração

### Camada 1: Requisições HTTP para a API OMS da VTEX (`f_creationDate`)

Quando for buscar pedidos da VTEX para um determinado **dia civil no Brasil** (ex: 13/08/2026 de 00:00:00 a 23:59:59 BRT), o parâmetro `f_creationDate` deve converter os horários limites para UTC:

- **Início BRT (00:00:00)** ➔ **03:00:00Z UTC** no mesmo dia.
- **Fim BRT (23:59:59)** ➔ **02:59:59Z UTC** do dia seguinte.

#### Código Utilitário (Node.js)

```javascript
/**
 * Retorna os blocos de data em UTC exigidos pela VTEX API 
 * para cobrir integralmente um dia civil no Brasil (00:00 a 23:59 BRT).
 */
function getVtexUtcQueryRange(brtDateStr) {
  // brtDateStr formato: "YYYY-MM-DD" (ex: "2026-08-13")
  const [y, m, d] = brtDateStr.split('-').map(Number);
  const nextDayDate = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDayStr = nextDayDate.toISOString().slice(0, 10);

  return {
    startUtc: `${brtDateStr}T03:00:00Z`,
    endUtc: `${nextDayStr}T02:59:59Z`,
    // Exemplo de URL pronta para requisição na VTEX:
    vtexFilterParam: `f_creationDate=creationDate:[${brtDateStr}T03:00:00Z TO ${nextDayStr}T02:59:59Z]`
  };
}
```

---

### Camada 2: Backend & Tratamento de Dados (Node.js / Express)

Ao receber qualquer payload de pedido com `order.creationDate`, o backend deve calcular e disponibilizar:

1. `date`: String de data no padrão BRT (`YYYY-MM-DD`) para indexação e filtragem.
2. `dateTimeStr`: String legível com Data e Hora de Brasília (`DD/MM/YYYY HH:mm:ss`) para apresentação.

#### Função de Conversão Pura e À Prova de Crashes (`convertVtexCreationDate`)

```javascript
/**
 * Converte qualquer ISO Date da VTEX (UTC) para objetos de data legíveis em Brasília (UTC-3).
 * Utiliza matemática pura de timestamp (zero risco de RangeError de locale/timezone).
 */
function convertVtexCreationDate(creationDateIso) {
  if (!creationDateIso) return { dateStr: '', dateTimeStr: '' };

  try {
    const d = new Date(creationDateIso);
    if (isNaN(d.getTime())) return { dateStr: '', dateTimeStr: '' };

    // Subtrai exatamente 3 horas (3 * 3.600.000 ms) para fuso de Brasília
    const brtMs = d.getTime() - (3 * 3600000);
    const brtDate = new Date(brtMs);
    const iso = brtDate.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"

    const [ymd, hms] = iso.split('T');
    const [y, m, day] = ymd.split('-');
    const time = hms.slice(0, 8); // "HH:mm:ss"

    return {
      dateStr: ymd,                          // "2026-08-12" (Data BRT YYYY-MM-DD)
      dateTimeStr: `${day}/${m}/${y} ${time}` // "12/08/2026 22:30:00" (Data/Hora BRT)
    };
  } catch (err) {
    return { dateStr: '', dateTimeStr: '' };
  }
}

// Exemplo de inclusão no endpoint da API:
app.get('/api/pedidos', (req, res) => {
  const pedidosTratados = pedidosVtex.map(order => {
    const { dateStr, dateTimeStr } = convertVtexCreationDate(order.creationDate);
    return {
      orderId: order.orderId,
      date: dateStr,            // Usado para filtros de data no frontend
      dateTimeStr: dateTimeStr,  // Usado para exibição na tabela e relatórios
      creationDateUtc: order.creationDate,
      value: order.value / 100
    };
  });

  res.json({ status: 'success', data: pedidosTratados });
});
```

---

### Camada 3: Frontend (React / JavaScript)

No frontend, garanta que a filtragem por período considere **apenas a data convertida em BRT** (`item.date`), eliminando completamente vazamentos UTC.

#### ❌ O que NÃO fazer

```javascript
// ❌ INCORRETO: Comparar usando OR com utcDate faz pedidos de ontem (22h) entrarem em hoje!
return orders.filter(item => 
  (item.date >= startDate && item.date <= endDate) ||
  (item.utcDate >= startDate && item.utcDate <= endDate)
);
```

#### ✅ Forma Correta e Crash-Safe

```javascript
/**
 * Retorna a data atual ou N dias atrás no padrão BRT (YYYY-MM-DD).
 */
function getBrtDateStr(daysAgo = 0) {
  try {
    const brtMs = Date.now() - (daysAgo * 86400000) - (3 * 3600000);
    return new Date(brtMs).toISOString().slice(0, 10);
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// Filtragem no componente React (useMemo):
const filteredData = useMemo(() => {
  if (!Array.isArray(orders)) return [];

  const today = getBrtDateStr(0); // "2026-08-13"
  const startDate = fDateMode === 'hoje' ? today : getBrtDateStr(1);
  const endDate = fDateMode === 'hoje' ? today : today;

  return orders.filter(item => {
    if (!item) return false;
    // Garante o uso estrito da data no Brasil
    const itemDate = item.date || (item.creationDate ? convertVtexCreationDate(item.creationDate).dateStr : null);
    return itemDate && itemDate >= startDate && itemDate <= endDate;
  });
}, [orders, fDateMode]);
```

---

### Camada 4: Exportação de Relatórios para Excel (`XLSX`)

Ao gerar planilhas Excel (.xlsx) para usuários operacionais e diretoria:

1. **Nomear a coluna com clareza**: Use o cabeçalho **`Data / Hora (BRT)`**.
2. **Formato de exibição**: Passe a string `dateTimeStr` (ex: `12/08/2026 22:30:00`).

#### Código de Exportação (Multi-Abas)

```javascript
const detailsSheetData = filteredData.map(item => ({
  'Nº Pedido': item.orderId || '',
  'Data / Hora (BRT)': item.dateTimeStr || (item.date ? item.date.split('-').reverse().join('/') : ''),
  'Cupom': item.coupon || '',
  'Loja': item.store || '',
  'Valor (R$)': Number((item.value || 0).toFixed(2))
}));

const wb = XLSX.utils.book_new();
const wsDetails = XLSX.utils.json_to_sheet(detailsSheetData);
XLSX.utils.book_append_sheet(wb, wsDetails, 'Detalhes Pedidos');
XLSX.writeFile(wb, `relatorio_pedidos_vtex_${getBrtDateStr(0)}.xlsx`);
```

---

## 3. 📋 Checklist de Validação Rápida

- [x] A query na API VTEX OMS usa `T03:00:00Z` até `T02:59:59Z` do dia seguinte para cobrir 1 dia civil BRT.
- [x] O backend subtrai 3 horas da `creationDate` UTC antes de extrair a string `YYYY-MM-DD`.
- [x] O frontend filtra estritamente pela propriedade `date` (BRT) e não possui `|| utcDate`.
- [x] O relatório em Excel exibe o cabeçalho `Data / Hora (BRT)` no formato `DD/MM/YYYY HH:mm:ss`.
- [x] Todas as funções de conversão possuem tratamento defensivo com `try/catch` para evitar tela branca no React.
