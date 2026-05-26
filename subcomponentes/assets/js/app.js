/*
  Controle Visual Rumo Cavan
  Projeto estático para GitHub Pages.
  - HTML: index.html
  - CSS: assets/css/styles.css
  - JS: assets/js/app.js
  - Dados: carregados somente por importação de planilha no navegador
*/
'use strict';

const THEME = {
  navy: '#003B67',
  navy2: '#002E53',
  blue: '#00A9E0',
  green: '#00D66B',
  yellow: '#FFDD00',
  white: '#FFFFFF',
  orange: '#FF8B3D'
};

const COLORS = [THEME.blue, THEME.green, THEME.yellow, '#AEEA00', '#80D8FF', '#F9FAFB', THEME.orange];
const TABS = [
  ['importar', '⬆', 'Importar planilha'],
  ['geral', '⇄', 'Dashboard geral'],
  ['estoque', '▦', 'Dashboard de estoque'],
  ['inspecoes', '✓', 'Dashboard de inspeções realizadas'],
  ['cards', '◇', 'Cards por subcomponente']
];

let initial = null;
let state = null;

function emptyDataset() {
  return {
    estoque: [],
    executados: [],
    source: 'Nenhuma planilha importada',
    importedAt: 'Aguardando importação',
    sheetNames: { estoqueName: '—', executadosName: '—' }
  };
}

function defaultFilters() {
  return {
    generalFilters: { component: '', status: '', hasNc: '', search: '' },
    stockFilters: { component: '', factory: '', status: '', search: '' },
    inspFilters: { material: '', fornecedor: '', status: '', semana: '', search: '' },
    cardFilters: { query: '', hasNc: '', hasStock: '' }
  };
}

function createInitialState() {
  initial = emptyDataset();
  return {
    data: initial,
    active: 'importar',
    ...defaultFilters(),
    message: '',
    error: ''
  };
}

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const norm = (v) => String(v ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();
const text = (v, fallback = '—') => {
  const s = String(v ?? '').trim();
  return s || fallback;
};
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return 0;
  const s = String(v)
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v) => Math.round(num(v)).toLocaleString('pt-BR');
const pct = (v) => `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const ratioPct = (a, b) => b ? (num(a) / num(b)) * 100 : 0;

function excelDateToIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 1 && v < 70000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (br) {
      const y = br[3].length === 2 ? `20${br[3]}` : br[3];
      return `${y}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
    }
    return s;
  }
  return '';
}
function fdate(v) {
  const iso = excelDateToIso(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return text(v);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function stockStatus(r) {
  const i = norm(r.dataInspecao);
  if (i.includes('NAO EXISTE') || i.includes('SEM ESTOQUE') || i.includes('ZERADO')) return 'Fora do estoque';
  if (text(r.dataInspecao, '') && /^\d{4}-\d{2}-\d{2}$/.test(excelDateToIso(r.dataInspecao))) return 'Inspecionado';
  if (text(r.dataInspecao, '') && !i.includes('NAO EXISTE')) return 'Em análise';
  return 'Pendente';
}
function lotKey(v) {
  const s = norm(v)
    .replace(/[.\-]/g, '/')
    .replace(/\s+/g, '')
    .replace(/^0+(?=\d)/, '')
    .replace(/\/0+(?=\d)/g, '/');
  return s || 'SEM LOTE';
}
function componentKey(v) {
  return norm(v).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() || 'SEM COMPONENTE';
}
function comparisonKey(component, lote) {
  return `${componentKey(component)}||${lotKey(lote)}`;
}
function pill(status) {
  const n = norm(status);
  let cls = '';
  if (n.includes('BATIDO') || n.includes('APROV') || n.includes('INSPECIONADO')) cls = 'ok';
  if (n.includes('PEND') || n.includes('ANALISE') || n.includes('SEM INSPECAO')) cls = 'warn';
  if (n.includes('FORA') || n.includes('NAO EXISTE') || n.includes('SEM SALDO')) cls = 'out';
  if (n.includes('NC')) cls = 'nc';
  return `<span class="pill ${cls}">${esc(text(status))}</span>`;
}
function uniq(records, getter) {
  return [...new Set(records.map(getter).filter(Boolean).map((v) => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function groupSum(records, keyGetter, valueGetter) {
  const m = new Map();
  records.forEach((r) => {
    const k = text(keyGetter(r), 'Sem informação');
    m.set(k, (m.get(k) || 0) + num(valueGetter(r)));
  });
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function groupCount(records, keyGetter) {
  const m = new Map();
  records.forEach((r) => {
    const k = text(keyGetter(r), 'Sem informação');
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function matches(haystack, query) {
  return !query || norm(haystack).includes(norm(query));
}
function optionList(options, selected, all = 'Todos') {
  return `<option value="">${all}</option>` + options.map((o) => `<option value="${esc(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');
}

function buildComparisonRows() {
  const stockMap = new Map();
  const inspectionMap = new Map();

  state.data.estoque.forEach((r) => {
    const status = stockStatus(r);
    const key = comparisonKey(r.subcomponente, r.lote);
    const item = stockMap.get(key) || {
      key,
      component: text(r.subcomponente),
      lote: text(r.lote),
      loteKey: lotKey(r.lote),
      totalEntrada: 0,
      saldoEstoque: 0,
      amostragem: 0,
      registrosEstoque: 0,
      foraEstoque: 0,
      fabricas: new Set(),
      stockStatuses: new Set(),
      obs: new Set()
    };
    const q = num(r.quantidadeEntrada);
    item.totalEntrada += q;
    item.registrosEstoque += 1;
    item.amostragem += num(r.amostragem);
    if (status === 'Fora do estoque') item.foraEstoque += 1;
    if (status !== 'Fora do estoque') item.saldoEstoque += q;
    if (text(r.fabrica, '')) item.fabricas.add(text(r.fabrica, ''));
    if (text(r.obs, '')) item.obs.add(text(r.obs, ''));
    item.stockStatuses.add(status);
    stockMap.set(key, item);
  });

  state.data.executados.forEach((r) => {
    const key = comparisonKey(r.material, r.lote);
    const item = inspectionMap.get(key) || {
      key,
      component: text(r.material),
      lote: text(r.lote),
      loteKey: lotKey(r.lote),
      qtdEstoqueInspecao: 0,
      qtdAmostra: 0,
      qtdInspecionado: 0,
      qtdNc: 0,
      registrosInspecao: 0,
      fornecedores: new Set(),
      inspectionStatuses: new Set(),
      codSap: new Set(),
      lastDate: ''
    };
    item.qtdEstoqueInspecao += num(r.qtdEstoque);
    item.qtdAmostra += num(r.qtdAmostra);
    item.qtdInspecionado += num(r.qtdInspecionado);
    item.qtdNc += num(r.qtdNc);
    item.registrosInspecao += 1;
    if (text(r.fornecedor, '')) item.fornecedores.add(text(r.fornecedor, ''));
    if (text(r.status, '')) item.inspectionStatuses.add(text(r.status, ''));
    if (text(r.codSap, '')) item.codSap.add(text(r.codSap, ''));
    const d = excelDateToIso(r.diaInspecao);
    if (d && d > item.lastDate) item.lastDate = d;
    inspectionMap.set(key, item);
  });

  const keys = new Set([...stockMap.keys(), ...inspectionMap.keys()]);
  return [...keys].map((key) => {
    const stock = stockMap.get(key);
    const inspection = inspectionMap.get(key);
    const component = stock?.component || inspection?.component || 'Sem componente';
    const lote = stock?.lote || inspection?.lote || 'Sem lote';
    const saldoEstoque = stock?.saldoEstoque || 0;
    const totalEntrada = stock?.totalEntrada || 0;
    const qtdEstoqueInspecao = inspection?.qtdEstoqueInspecao || 0;
    const qtdInspecionado = inspection?.qtdInspecionado || 0;
    const qtdNc = inspection?.qtdNc || 0;
    const hasStockRecord = Boolean(stock);
    const hasActiveStock = saldoEstoque > 0;
    const hasInspection = Boolean(inspection);
    const diffEstoqueInspecao = saldoEstoque - qtdEstoqueInspecao;
    let status = 'Fora do estoque';
    if (hasActiveStock && hasInspection) status = qtdNc > 0 ? 'Inspeção realizada com NC' : 'Inspeção realizada';
    if (hasActiveStock && !hasInspection) status = 'Pendente de inspeção';
    if (!hasActiveStock && hasInspection) status = 'Inspecionado sem saldo atual';
    if (hasStockRecord && !hasActiveStock && !hasInspection) status = 'Fora do estoque';

    return {
      key,
      component,
      lote,
      loteKey: stock?.loteKey || inspection?.loteKey || lotKey(lote),
      status,
      totalEntrada,
      saldoEstoque,
      qtdEstoqueInspecao,
      qtdAmostra: inspection?.qtdAmostra || 0,
      qtdInspecionado,
      qtdNc,
      diffEstoqueInspecao,
      registrosEstoque: stock?.registrosEstoque || 0,
      registrosInspecao: inspection?.registrosInspecao || 0,
      hasStockRecord,
      hasActiveStock,
      hasInspection,
      fabricas: stock ? [...stock.fabricas] : [],
      fornecedores: inspection ? [...inspection.fornecedores] : [],
      stockStatuses: stock ? [...stock.stockStatuses] : [],
      inspectionStatuses: inspection ? [...inspection.inspectionStatuses] : [],
      codSap: inspection ? [...inspection.codSap] : [],
      lastDate: inspection?.lastDate || ''
    };
  }).sort((a, b) => {
    const weight = (r) => r.status === 'Pendente de inspeção' ? 4 : r.status === 'Inspeção realizada com NC' ? 3 : r.status === 'Inspeção realizada' ? 2 : 1;
    return weight(b) - weight(a) || b.saldoEstoque - a.saldoEstoque || a.component.localeCompare(b.component, 'pt-BR');
  });
}
function filterComparisonRows(rows, f) {
  return rows.filter((r) =>
    (!f.component || r.component === f.component) &&
    (!f.status || r.status === f.status) &&
    (f.hasNc !== 'sim' || r.qtdNc > 0) &&
    (f.hasNc !== 'nao' || r.qtdNc <= 0) &&
    matches(`${r.component} ${r.lote} ${r.loteKey} ${r.status} ${r.fabricas.join(' ')} ${r.fornecedores.join(' ')} ${r.codSap.join(' ')}`, f.search)
  );
}
function componentComparison(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = r.component;
    const item = map.get(key) || {
      name: key,
      estoque: 0,
      estoqueInspecao: 0,
      inspecionado: 0,
      nc: 0,
      lotesEstoque: 0,
      lotesComInspecao: 0,
      pendentes: 0
    };
    item.estoque += r.saldoEstoque;
    item.estoqueInspecao += r.qtdEstoqueInspecao;
    item.inspecionado += r.qtdInspecionado;
    item.nc += r.qtdNc;
    if (r.hasActiveStock) item.lotesEstoque += 1;
    if (r.hasActiveStock && r.hasInspection) item.lotesComInspecao += 1;
    if (r.status === 'Pendente de inspeção') item.pendentes += 1;
    map.set(key, item);
  });
  return [...map.values()].sort((a, b) => (b.estoque + b.estoqueInspecao) - (a.estoque + a.estoqueInspecao));
}
function dualBarList(data) {
  if (!data.length) return empty();
  const max = Math.max(...data.flatMap((d) => [d.estoque, d.estoqueInspecao]), 1);
  return `<div class="dual-list">${data.map((d) => `
    <div class="dual-row">
      <div class="bar-label" title="${esc(d.name)}">${esc(d.name)}</div>
      <div class="dual-bars">
        <div class="dual-line"><span>Saldo atual</span><div class="dual-track"><div class="dual-fill stock" style="width:${Math.max(2, d.estoque / max * 100)}%"></div></div><strong>${fmt(d.estoque)}</strong></div>
        <div class="dual-line"><span>Qtd. estoque na inspeção</span><div class="dual-track"><div class="dual-fill insp" style="width:${Math.max(2, d.estoqueInspecao / max * 100)}%"></div></div><strong>${fmt(d.estoqueInspecao)}</strong></div>
      </div>
    </div>`).join('')}</div>`;
}
function progressList(data) {
  if (!data.length) return empty();
  return `<div class="bar-list">${data.map((d) => {
    const cobertura = ratioPct(d.lotesComInspecao, d.lotesEstoque);
    return `<div class="bar-row"><div class="bar-label" title="${esc(d.name)}">${esc(d.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, Math.min(100, cobertura))}%"></div></div><div class="bar-value">${pct(cobertura)}</div></div>`;
  }).join('')}</div>`;
}
function differenceClass(value) {
  const n = num(value);
  if (n > 0) return 'delta positive';
  if (n < 0) return 'delta negative';
  return 'delta zero';
}

function header() {
  const d = state.data;
  const comparison = buildComparisonRows();
  const stockLots = comparison.filter((r) => r.hasActiveStock).length;
  const matchedLots = comparison.filter((r) => r.hasActiveStock && r.hasInspection).length;
  const baseLoaded = state.data.estoque.length > 0 || state.data.executados.length > 0;
  const sourceLabel = baseLoaded ? d.source : 'Nenhuma planilha importada';
  return `<header class="hero hero-clean">
    <a class="back-link" href="../">← Voltar para a página principal</a>
    <div class="hero-top">
      <div class="brand-lockup">
        <div class="logo" aria-label="Rumo"><img class="logo__img" src="../assets/brand/rumo-logo-positivo.png" alt="Rumo Logística" /></div>
        <div class="brand-copy">
          <p class="eyebrow">Subcomponentes</p>
          <h1>Controle visual de estoque e inspeções</h1>
        </div>
      </div>
      <div class="base-badge ${baseLoaded ? 'loaded' : ''}" title="${esc(sourceLabel)}">
        <span class="status-dot"></span>
        <span class="base-kicker">Base atual</span>
        <strong>${esc(sourceLabel)}</strong>
      </div>
    </div>
    <div class="hero-summary">
      <p class="desc">Importe uma planilha no modelo combinado para visualizar estoque e inspeções realizadas.</p>
      <div class="hero-metrics">
        <div class="tile clip"><div class="tile-label">Lotes em estoque</div><div class="tile-value">${fmt(stockLots)}</div></div>
        <div class="tile clip"><div class="tile-label">Inspeções realizadas</div><div class="tile-value">${fmt(matchedLots)}</div></div>
        <div class="tile clip yellow"><div class="tile-label">Cobertura</div><div class="tile-value">${pct(ratioPct(matchedLots, stockLots))}</div></div>
      </div>
    </div>
    <nav class="tabs" aria-label="Navegação principal">${TABS.map(([id, ico, label]) => `<button class="tab-btn ${state.active === id ? 'active' : ''}" data-tab="${id}" aria-current="${state.active === id ? 'page' : 'false'}"><span class="tab-icon">${ico}</span><span class="tab-label">${label}</span></button>`).join('')}</nav>
  </header>`;
}
function panel(title, subtitle, icon, body, extra = '') {
  return `<section class="panel"><div class="panel-head"><div class="panel-title"><div class="icon-box">${icon}</div><div><h2>${title}</h2>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}</div></div>${extra}</div>${body}</section>`;
}
function kpi(title, value, sub, icon, accent) {
  return `<div class="kpi" style="--accent:${accent}"><div class="kpi-top"><div><div class="kpi-title">${title}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div><div class="kpi-icon">${icon}</div></div></div>`;
}
function barList(data, valueLabel = '') {
  if (!data.length) return empty();
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div class="bar-list">${data.map((d) => `<div class="bar-row"><div class="bar-label" title="${esc(d.name)}">${esc(d.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (d.value / max) * 100)}%"></div></div><div class="bar-value">${fmt(d.value)}${valueLabel}</div></div>`).join('')}</div>`;
}
function donut(data) {
  if (!data.length) return empty();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let start = 0;
  const stops = data.map((d, i) => {
    const deg = d.value / total * 360;
    const seg = `${COLORS[i % COLORS.length]} ${start}deg ${start + deg}deg`;
    start += deg;
    return seg;
  }).join(',');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div><div class="legend">${data.map((d, i) => `<div class="legend-row"><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span><strong>${esc(d.name)}</strong><span>${fmt(d.value)}</span></div>`).join('')}</div></div>`;
}
function niceMax(value) {
  const n = Math.max(1, num(value));
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const rounded = Math.ceil(n / magnitude * 1.05) * magnitude;
  return rounded || 1;
}
function weekSortValue(name) {
  const s = String(name ?? '');
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}
function lineChart(data) {
  if (!data.length) return empty();
  const w = 920, h = 360;
  const left = 78, right = 28, top = 28, bottom = 82;
  const chartW = w - left - right;
  const chartH = h - top - bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const step = chartW / Math.max(data.length - 1, 1);
  const y = (value) => top + chartH - (num(value) / max) * chartH;
  const pts = data.map((d, i) => {
    const x = left + i * step;
    return [x, y(d.value), d];
  });
  const poly = pts.map((point) => `${point[0]},${point[1]}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i));
  const xLabels = pts.map(([x, _y, d], i) => {
    const label = esc(d.name);
    const rotate = data.length > 7 ? ` transform="rotate(-35 ${x} ${h - bottom + 28})" text-anchor="end"` : ' text-anchor="middle"';
    return `<text class="axis-text" x="${x}" y="${h - bottom + 32}"${rotate}>${label}</text>`;
  }).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Gráfico de quantidade inspecionada por semana"><defs><linearGradient id="gWeek" x1="0" x2="1"><stop stop-color="${THEME.yellow}"/><stop offset="1" stop-color="${THEME.green}"/></linearGradient></defs><g>${ticks.map((t) => { const yy = y(t); return `<line class="grid-line" x1="${left}" x2="${w - right}" y1="${yy}" y2="${yy}"/><text class="axis-text" x="${left - 12}" y="${yy + 5}" text-anchor="end">${fmt(t)}</text>`; }).join('')}</g><line class="axis-line" x1="${left}" x2="${left}" y1="${top}" y2="${h - bottom}"/><line class="axis-line" x1="${left}" x2="${w - right}" y1="${h - bottom}" y2="${h - bottom}"/><text class="axis-label" x="${left + chartW / 2}" y="${h - 12}" text-anchor="middle">Semana</text><text class="axis-label" x="20" y="${top + chartH / 2}" text-anchor="middle" transform="rotate(-90 20 ${top + chartH / 2})">Quantidade</text>${xLabels}<polyline fill="none" stroke="url(#gWeek)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${poly}"/>${pts.map(([x, yy, d]) => `<circle cx="${x}" cy="${yy}" r="6" fill="${THEME.yellow}"><title>${esc(d.name)}: ${fmt(d.value)}</title></circle><text class="axis-text" x="${x}" y="${yy - 12}" text-anchor="middle">${fmt(d.value)}</text>`).join('')}</svg>`;
}
function empty(title = 'Sem dados para exibir', sub = 'Importe uma planilha ou ajuste os filtros.') {
  return `<div class="empty"><strong>${title}</strong><br><span>${sub}</span></div>`;
}

function hasData() {
  return Boolean((state?.data?.estoque?.length || 0) + (state?.data?.executados?.length || 0));
}
function importPrompt(area = 'Dashboard') {
  return panel(area, 'Nenhuma planilha importada ainda.', '⬆', `<div class="empty"><strong>O painel está zerado.</strong><br><span>Importe uma planilha .xlsx no mesmo modelo para carregar estoque, inspeções realizadas, cards e cruzamento geral.</span><div style="margin-top:18px"><button class="primary" data-tab="importar">Ir para importar planilha</button></div></div>`);
}
function renderImport() {
  const d = state.data;
  const loaded = hasData();
  return `<div class="grid grid-2">
    ${panel('Importar planilha', 'O site inicia sem dados. Carregue uma planilha no mesmo modelo para preencher os dashboards.', '⬆', `<div class="drop" id="drop"><div class="upload-circle">⬆</div><h2>Arraste a planilha aqui</h2><p class="subtitle" style="max-width:720px;margin:10px auto 0">O site procura automaticamente uma aba de estoque e uma aba de inspeções realizadas. O cruzamento geral usa subcomponente/material + lote para comparar saldo de estoque, estoque informado na inspeção, quantidade inspecionada e NC.</p><div style="margin-top:22px"><label class="primary">Selecionar arquivo .xlsx <input id="fileInput" type="file" accept=".xlsx,.xls" hidden></label><button class="secondary" id="resetBase" style="margin-left:10px">Limpar dados</button></div>${state.message ? `<div class="message ok">${esc(state.message)}</div>` : ''}${state.error ? `<div class="message warn">${esc(state.error)}</div>` : ''}${!window.XLSX ? `<div class="message warn">A biblioteca de importação ainda não carregou. Abra o site com internet ativa para importar novas planilhas.</div>` : ''}</div>`)}
    ${panel('Status da base', loaded ? 'Planilha carregada nesta sessão.' : 'Aguardando importação da sua planilha.', loaded ? '✓' : '○', `<div class="grid grid-2"><div class="tile clip ${loaded ? 'yellow' : ''}"><div class="tile-label">Fonte atual</div><div class="tile-value" style="font-size:18px">${esc(d.source)}</div><div style="margin-top:6px;opacity:.72;font-size:13px">${esc(d.importedAt)}</div></div><div class="tile clip"><div class="tile-label">Abas lidas</div><div style="margin-top:12px;font-weight:800">Estoque: ${esc(text(d.sheetNames?.estoqueName, '—'))}</div><div style="margin-top:6px;font-weight:800">Inspeções: ${esc(text(d.sheetNames?.executadosName, '—'))}</div></div><div class="tile clip"><div class="tile-label">Estoque</div><div class="tile-value">${fmt(d.estoque.length)}</div><div class="subtitle">linhas válidas</div></div><div class="tile clip"><div class="tile-label">Inspeções</div><div class="tile-value">${fmt(d.executados.length)}</div><div class="subtitle">registros executados</div></div></div>`)}
  </div>`;
}
function renderGeneral() {
  if (!hasData()) return importPrompt('Dashboard geral');
  const rows = buildComparisonRows();
  const f = state.generalFilters;
  const filtered = filterComparisonRows(rows, f);
  const activeStockLots = filtered.filter((r) => r.hasActiveStock).length;
  const matchedLots = filtered.filter((r) => r.hasActiveStock && r.hasInspection).length;
  const pendingLots = filtered.filter((r) => r.status === 'Pendente de inspeção').length;
  const ncLots = filtered.filter((r) => r.qtdNc > 0).length;
  const totalSaldo = filtered.reduce((s, r) => s + r.saldoEstoque, 0);
  const totalQtdEstoqueInspecao = filtered.reduce((s, r) => s + r.qtdEstoqueInspecao, 0);
  const totalInspecionado = filtered.reduce((s, r) => s + r.qtdInspecionado, 0);
  const cobertura = ratioPct(matchedLots, activeStockLots);
  const comp = componentComparison(filtered);
  const status = groupCount(filtered, (r) => r.status);
  const pendentes = comp.filter((d) => d.pendentes > 0).map((d) => ({ name: d.name, value: d.pendentes })).slice(0, 10);
  const nc = filtered.filter((r) => r.qtdNc > 0).map((r) => ({ name: `${r.component} • ${r.lote}`, value: r.qtdNc })).sort((a, b) => b.value - a.value).slice(0, 10);
  const coberturaPorComponente = comp.filter((d) => d.lotesEstoque > 0).sort((a, b) => ratioPct(a.lotesComInspecao, a.lotesEstoque) - ratioPct(b.lotesComInspecao, b.lotesEstoque)).slice(0, 10);

  return `<div class="grid grid-4">
    ${kpi('Cobertura de lotes', pct(cobertura), `${fmt(matchedLots)} de ${fmt(activeStockLots)} lotes em estoque`, '⇄', THEME.blue)}
    ${kpi('Saldo em estoque', fmt(totalSaldo), 'saldo ativo filtrado', '▦', THEME.green)}
    ${kpi('Qtd. estoque inspecionada', fmt(totalQtdEstoqueInspecao), `amostra inspecionada: ${fmt(totalInspecionado)}`, '✓', THEME.yellow)}
    ${kpi('Pendências / NC', `${fmt(pendingLots)} / ${fmt(ncLots)}`, 'lotes pendentes e lotes com NC', '!', THEME.white)}
  </div>
  <div style="height:18px"></div>${panel('Filtros do dashboard geral', 'Cruzamento feito por subcomponente/material + lote normalizado.', '☰', filtersGeneral(rows, f))}
  <div style="height:18px"></div>${panel('Estoque x inspeção por subcomponente', 'Compara o saldo atual em estoque com a QTD Estoque registrada nas inspeções.', '⇄', dualBarList(comp.slice(0, 10)))}
  <div style="height:18px"></div><div class="grid grid-2">${panel('Situação do cruzamento', 'Classificação por lote e subcomponente.', '✓', donut(status))}${panel('Menor cobertura por subcomponente', 'Percentual de lotes ativos que já aparecem nas inspeções realizadas.', '%', progressList(coberturaPorComponente))}</div>
  <div style="height:18px"></div>${panel('Pendentes e NC', 'Top pendências de inspeção e não conformidades.', '!', `<div class="grid grid-2"><div>${pendentes.length ? `<p class="subtitle" style="margin-bottom:12px">Pendentes de inspeção</p>${barList(pendentes)}` : empty('Sem pendências nos filtros', 'Todos os lotes filtrados em estoque possuem inspeção relacionada.')}</div><div>${nc.length ? `<p class="subtitle" style="margin-bottom:12px">Não conformidades</p>${barList(nc)}` : empty('Sem NC nos filtros', 'Nenhum lote filtrado possui QTD NC acima de zero.')}</div></div>`)}
  <div style="height:18px"></div>${panel('Matriz de comparação subcomponente + lote', `${fmt(filtered.length)} combinações encontradas`, '▦', comparisonTable(filtered))}`;
}
function filtersGeneral(rows, f) {
  return `<div class="filter-grid grid-4">
    <label class="control">Subcomponente<select data-filter="gen.component">${optionList(uniq(rows, (r) => r.component), f.component)}</select></label>
    <label class="control">Situação<select data-filter="gen.status">${optionList(uniq(rows, (r) => r.status), f.status)}</select></label>
    <label class="control">NC?<select data-filter="gen.hasNc">${optionList(['sim', 'nao'], f.hasNc)}</select></label>
    <label class="control">Busca<div class="search-wrap">🔎<input type="search" value="${esc(f.search)}" placeholder="Buscar lote, fornecedor, fábrica..." data-filter="gen.search"></div></label>
  </div>`;
}
function comparisonTable(rows) {
  return `<div class="table-wrap"><div class="scroll"><table class="compare-table"><thead><tr><th>Subcomponente</th><th>Lote</th><th>Situação</th><th class="right">Saldo estoque</th><th class="right">QTD estoque inspeção</th><th class="right">Diferença</th><th class="right">Qtd. inspecionada</th><th class="right">QTD NC</th><th>Fábrica / Fornecedor</th><th>Última inspeção</th></tr></thead><tbody>${rows.slice(0, 350).map((r) => `<tr><td><strong>${esc(text(r.component))}</strong></td><td>${esc(text(r.lote))}</td><td>${pill(r.status)}</td><td class="right"><strong>${fmt(r.saldoEstoque)}</strong></td><td class="right">${fmt(r.qtdEstoqueInspecao)}</td><td class="right"><span class="${differenceClass(r.diffEstoqueInspecao)}">${fmt(r.diffEstoqueInspecao)}</span></td><td class="right">${fmt(r.qtdInspecionado)}</td><td class="right"><strong>${fmt(r.qtdNc)}</strong></td><td>${esc([r.fabricas.join(', '), r.fornecedores.join(', ')].filter(Boolean).join(' / ') || '—')}</td><td>${esc(fdate(r.lastDate))}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function filtersStock(records, filters) {
  return `<div class="filter-grid grid-4"><label class="control">Subcomponente<select data-filter="stock.component">${optionList(uniq(records, (r) => r.subcomponente), filters.component)}</select></label><label class="control">Fábrica<select data-filter="stock.factory">${optionList(uniq(records, (r) => r.fabrica), filters.factory)}</select></label><label class="control">Status<select data-filter="stock.status">${optionList(uniq(records, (r) => r.status), filters.status)}</select></label><label class="control">Busca<div class="search-wrap">🔎<input type="search" value="${esc(filters.search)}" placeholder="Buscar lote, material, observação..." data-filter="stock.search"></div></label></div>`;
}
function renderStock() {
  if (!hasData()) return importPrompt('Dashboard de estoque');
  const enriched = state.data.estoque.map((r) => ({ ...r, status: stockStatus(r) }));
  const f = state.stockFilters;
  const filtered = enriched.filter((r) => (!f.component || r.subcomponente === f.component) && (!f.factory || r.fabrica === f.factory) && (!f.status || r.status === f.status) && matches(`${r.subcomponente} ${r.lote} ${r.fabrica} ${r.obs} ${r.dataInspecao}`, f.search));
  const total = filtered.reduce((s, r) => s + num(r.quantidadeEntrada), 0);
  const saldo = filtered.filter((r) => r.status !== 'Fora do estoque').reduce((s, r) => s + num(r.quantidadeEntrada), 0);
  const amostra = filtered.reduce((s, r) => s + num(r.amostragem), 0);
  const lotes = new Set(filtered.filter((r) => r.status !== 'Fora do estoque').map((r) => `${r.subcomponente}-${r.lote}`)).size;
  const comp = groupSum(filtered.filter((r) => r.status !== 'Fora do estoque'), (r) => r.subcomponente, (r) => r.quantidadeEntrada).slice(0, 10);
  const status = groupCount(filtered, (r) => r.status);
  const fab = groupSum(filtered, (r) => r.fabrica, (r) => r.quantidadeEntrada).slice(0, 8);
  return `<div class="grid grid-4">${kpi('Entrada total', fmt(total), 'soma dos registros filtrados', '▣', THEME.blue)}${kpi('Saldo estimado', fmt(saldo), 'exclui itens fora do estoque', '▦', THEME.green)}${kpi('Lotes ativos', fmt(lotes), 'subcomponente + lote', '◇', THEME.yellow)}${kpi('Amostragem', fmt(amostra), 'quantidade prevista para inspeção', '✓', THEME.white)}</div>
  <div style="height:18px"></div>${panel('Filtros do estoque', 'Os filtros afetam KPIs, gráficos e tabela.', '☰', filtersStock(enriched, f))}
  <div style="height:18px"></div><div class="grid grid-2">${panel('Saldo por subcomponente', 'Top 10 pelo saldo estimado.', '▤', barList(comp))}${panel('Status do estoque', 'Distribuição por lote/registro.', '✓', donut(status))}</div>
  <div style="height:18px"></div>${panel('Entrada por fábrica', 'Visão da origem dos subcomponentes.', '⌂', barList(fab))}
  <div style="height:18px"></div>${panel('Itens de estoque', `${fmt(filtered.length)} registros encontrados`, '▦', stockTable(filtered))}`;
}
function stockTable(rows) {
  return `<div class="table-wrap"><div class="scroll"><table><thead><tr><th>Data</th><th>Fábrica</th><th>Subcomponente</th><th>Lote</th><th class="right">Entrada</th><th class="right">Amostragem</th><th>Status</th><th>Inspeção</th></tr></thead><tbody>${rows.slice(0, 250).map((r) => `<tr><td>${esc(fdate(r.data))}</td><td>${esc(text(r.fabrica))}</td><td><strong>${esc(text(r.subcomponente))}</strong></td><td>${esc(text(r.lote))}</td><td class="right"><strong>${fmt(r.quantidadeEntrada)}</strong></td><td class="right">${fmt(r.amostragem)}</td><td>${pill(r.status)}</td><td>${esc(fdate(r.dataInspecao))}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderInspections() {
  if (!hasData()) return importPrompt('Dashboard de inspeções realizadas');
  const records = state.data.executados;
  const f = state.inspFilters;
  const filtered = records.filter((r) => (!f.material || r.material === f.material) && (!f.fornecedor || r.fornecedor === f.fornecedor) && (!f.status || r.status === f.status) && (!f.semana || r.semana === f.semana) && matches(`${r.material} ${r.lote} ${r.fornecedor} ${r.status} ${r.codSap}`, f.search));
  const ins = filtered.reduce((s, r) => s + num(r.qtdInspecionado), 0);
  const nc = filtered.reduce((s, r) => s + num(r.qtdNc), 0);
  const am = filtered.reduce((s, r) => s + num(r.qtdAmostra), 0);
  const ncRate = ins ? nc / ins * 100 : 0;
  const status = groupCount(filtered, (r) => r.status);
  const week = groupSum(filtered, (r) => r.semana || fdate(r.diaInspecao), (r) => r.qtdInspecionado).sort((a, b) => weekSortValue(a.name) - weekSortValue(b.name) || a.name.localeCompare(b.name, 'pt-BR')).slice(-14);
  const forn = groupSum(filtered, (r) => r.fornecedor, (r) => r.qtdInspecionado).slice(0, 8);
  const matNc = groupSum(filtered, (r) => r.material, (r) => r.qtdNc).filter((d) => d.value > 0).slice(0, 10);
  return `<div class="grid grid-4">${kpi('Inspeções', fmt(filtered.length), 'lotes/BAGs executados', '✓', THEME.blue)}${kpi('Qtd. inspecionada', fmt(ins), `amostra: ${fmt(am)}`, '▣', THEME.green)}${kpi('Não conformidades', fmt(nc), 'soma de QTD NC', '!', THEME.yellow)}${kpi('Taxa NC', pct(ncRate), 'NC / qtd. inspecionada', '%', THEME.white)}</div>
  <div style="height:18px"></div>${panel('Filtros das inspeções realizadas', 'Filtre por material, fornecedor, semana e status.', '☰', filtersInspection(records, f))}
  <div style="height:18px"></div><div class="grid grid-2">${panel('Inspecionado por semana', 'Evolução dos registros executados.', '⌁', lineChart(week))}${panel('Status das inspeções', 'Resultado por lote/BAG.', '✓', donut(status))}</div>
  <div style="height:18px"></div><div class="grid grid-2">${panel('Inspecionado por fornecedor', 'Top fornecedores por quantidade inspecionada.', '⌂', barList(forn))}${panel('Materiais com NC', 'Aparecem apenas itens com QTD NC acima de zero.', '!', matNc.length ? barList(matNc) : empty('Nenhuma NC nos filtros', 'Os registros filtrados não possuem não conformidades.'))}</div>
  <div style="height:18px"></div>${panel('Tabela de inspeções realizadas', `${fmt(filtered.length)} registros encontrados`, '▦', inspectionTable(filtered))}`;
}
function filtersInspection(records, f) {
  return `<div class="filter-grid grid-5"><label class="control">Material<select data-filter="insp.material">${optionList(uniq(records, (r) => r.material), f.material)}</select></label><label class="control">Fornecedor<select data-filter="insp.fornecedor">${optionList(uniq(records, (r) => r.fornecedor), f.fornecedor)}</select></label><label class="control">Status<select data-filter="insp.status">${optionList(uniq(records, (r) => r.status), f.status)}</select></label><label class="control">Semana<select data-filter="insp.semana">${optionList(uniq(records, (r) => r.semana), f.semana)}</select></label><label class="control">Busca<div class="search-wrap">🔎<input type="search" value="${esc(f.search)}" placeholder="Buscar lote, SAP..." data-filter="insp.search"></div></label></div>`;
}
function inspectionTable(rows) {
  return `<div class="table-wrap"><div class="scroll"><table><thead><tr><th>Data</th><th>Semana</th><th>Material</th><th>SAP</th><th>Fornecedor</th><th>Lote</th><th class="right">QTD Estoque</th><th class="right">Amostra</th><th class="right">Inspecionado</th><th class="right">NC</th><th>Status</th></tr></thead><tbody>${rows.slice(0, 250).map((r) => `<tr><td>${esc(fdate(r.diaInspecao))}</td><td>${esc(text(r.semana))}</td><td><strong>${esc(text(r.material))}</strong></td><td>${esc(text(r.codSap))}</td><td>${esc(text(r.fornecedor))}</td><td>${esc(text(r.lote))}</td><td class="right">${fmt(r.qtdEstoque)}</td><td class="right">${fmt(r.qtdAmostra)}</td><td class="right"><strong>${fmt(r.qtdInspecionado)}</strong></td><td class="right"><strong>${fmt(r.qtdNc)}</strong></td><td>${pill(r.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function combineCards() {
  const map = new Map();
  const ensure = (name) => {
    const key = norm(name);
    if (!map.has(key)) map.set(key, { key, name: text(name), totalEntrada: 0, saldoEstimado: 0, lotes: new Set(), fabricas: new Set(), pendentes: 0, foraEstoque: 0, inspecoes: 0, qtdInspecionado: 0, qtdNc: 0, status: new Set(), fornecedores: new Set() });
    return map.get(key);
  };
  state.data.estoque.forEach((r) => {
    const c = ensure(r.subcomponente);
    const st = stockStatus(r);
    const q = num(r.quantidadeEntrada);
    c.totalEntrada += q;
    if (st !== 'Fora do estoque') c.saldoEstimado += q;
    if (text(r.lote, '')) c.lotes.add(text(r.lote, ''));
    if (text(r.fabrica, '')) c.fabricas.add(text(r.fabrica, ''));
    if (st === 'Pendente') c.pendentes += 1;
    if (st === 'Fora do estoque') c.foraEstoque += 1;
  });
  state.data.executados.forEach((r) => {
    const c = ensure(r.material);
    c.inspecoes += 1;
    c.qtdInspecionado += num(r.qtdInspecionado);
    c.qtdNc += num(r.qtdNc);
    if (text(r.status, '')) c.status.add(text(r.status, ''));
    if (text(r.fornecedor, '')) c.fornecedores.add(text(r.fornecedor, ''));
  });
  return [...map.values()].map((c) => ({ ...c, lotes: [...c.lotes], fabricas: [...c.fabricas], status: [...c.status], fornecedores: [...c.fornecedores], ncRate: c.qtdInspecionado ? c.qtdNc / c.qtdInspecionado * 100 : 0 })).sort((a, b) => b.saldoEstimado - a.saldoEstimado || b.qtdInspecionado - a.qtdInspecionado);
}
function renderCards() {
  if (!hasData()) return importPrompt('Cards por subcomponente');
  const f = state.cardFilters;
  const cards = combineCards().filter((c) => (f.hasNc !== 'sim' || c.qtdNc > 0) && (f.hasNc !== 'nao' || c.qtdNc <= 0) && (f.hasStock !== 'sim' || c.saldoEstimado > 0) && (f.hasStock !== 'nao' || c.saldoEstimado <= 0) && matches(`${c.name} ${c.fabricas.join(' ')} ${c.fornecedores.join(' ')} ${c.status.join(' ')}`, f.query));
  return `${panel('Filtros dos cards', 'Cards consolidados por subcomponente/material.', '☰', `<div class="filter-grid grid-3"><label class="control">Busca<div class="search-wrap">🔎<input type="search" value="${esc(f.query)}" placeholder="Buscar subcomponente, fábrica ou fornecedor..." data-filter="card.query"></div></label><label class="control">Com NC?<select data-filter="card.hasNc">${optionList(['sim', 'nao'], f.hasNc)}</select></label><label class="control">Com saldo estimado?<select data-filter="card.hasStock">${optionList(['sim', 'nao'], f.hasStock)}</select></label></div>`)}<div style="height:18px"></div><div class="cards">${cards.map(cardHtml).join('')}</div>${cards.length ? '' : empty('Nenhum card encontrado', 'Ajuste os filtros dos cards para visualizar os subcomponentes.')}`;
}
function cardHtml(c) {
  return `<article class="card ${c.qtdNc > 0 ? 'nc' : ''}"><p class="eyebrow" style="color:${c.qtdNc > 0 ? THEME.yellow : THEME.green};letter-spacing:.18em">Subcomponente</p><h3>${esc(c.name)}</h3><div class="card-grid"><div class="mini clip"><div class="tile-label">Saldo estimado</div><div class="num">${fmt(c.saldoEstimado)}</div></div><div class="mini clip ${c.qtdNc > 0 ? 'yellow' : ''}"><div class="tile-label">QTD NC</div><div class="num">${fmt(c.qtdNc)}</div></div><div class="mini clip"><div class="tile-label">Inspecionado</div><div class="num">${fmt(c.qtdInspecionado)}</div></div><div class="mini clip"><div class="tile-label">Lotes estoque</div><div class="num">${fmt(c.lotes.length)}</div></div></div><div class="meta"><strong style="color:white">Entrada total:</strong> ${fmt(c.totalEntrada)}<br><strong style="color:white">Pendências:</strong> ${fmt(c.pendentes)} registros de estoque<br><strong style="color:white">Taxa NC:</strong> ${pct(c.ncRate)}<br><strong style="color:white">Fábricas:</strong> ${esc(c.fabricas.slice(0, 3).join(', ') || '—')}<br><strong style="color:white">Fornecedores:</strong> ${esc(c.fornecedores.slice(0, 3).join(', ') || '—')}</div><div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">${c.status.length ? c.status.map(pill).join('') : pill('Sem inspeção')}</div></article>`;
}

function buildHeaderMap(row) {
  const m = new Map();
  row.forEach((cell, i) => {
    const k = norm(cell);
    if (k) m.set(k, i);
  });
  return m;
}
function pick(row, map, aliases) {
  for (const a of aliases) {
    const idx = map.get(norm(a));
    if (idx !== undefined) return row[idx];
  }
  return null;
}
function findHeader(rows, groups) {
  return rows.findIndex((row) => {
    const normalized = row.map(norm);
    return groups.every((group) => group.some((alias) => normalized.includes(norm(alias))));
  });
}
function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}
function parseEstoqueSheet(sheet, fallback = 'Estoque') {
  if (!sheet) return [];
  const rows = sheetRows(sheet);
  const h = findHeader(rows, [['Subcomponente'], ['Quantidade Entrada', 'Quantidade', 'QTD ESTOQUE']]);
  if (h < 0) return [];
  const map = buildHeaderMap(rows[h]);
  return rows.slice(h + 1).map((row, i) => {
    const sub = text(pick(row, map, ['Subcomponente', 'Material', 'Item']), '');
    if (!sub) return null;
    return {
      id: `${fallback}-${i + 1}`,
      data: excelDateToIso(pick(row, map, ['Data', 'Data entrada', 'Data de entrada'])),
      fabrica: text(pick(row, map, ['Fábrica', 'Fabrica', 'Fornecedor']), ''),
      subcomponente: sub,
      lote: text(pick(row, map, ['Lote', 'LOTE']), ''),
      quantidadeEntrada: num(pick(row, map, ['Quantidade Entrada', 'Quantidade', 'QTD ESTOQUE', 'Qtd estoque'])),
      obs: text(pick(row, map, ['obs', 'Observação', 'OBS']), ''),
      amostragem: num(pick(row, map, ['Amostragem', 'QTD AMOSTRA', 'Qtd amostra'])),
      dataInspecao: excelDateToIso(pick(row, map, ['Data da Inspeção', 'Data Inspeção', 'Dia inspeção'])),
      observacao: text(pick(row, map, ['OBSERVAÇÃO', 'Observacao', 'OBSERVAÇÕES']), '')
    };
  }).filter(Boolean);
}
function parseExecutadosSheet(sheet, fallback = 'Executados') {
  if (!sheet) return [];
  const rows = sheetRows(sheet);
  const h = findHeader(rows, [['MATERIAL', 'SUBCOMPONENTE'], ['QTD INSPECIONADO', 'QTD INSPECIONADA']]);
  if (h < 0) return [];
  const map = buildHeaderMap(rows[h]);
  return rows.slice(h + 1).map((row, i) => {
    const material = text(pick(row, map, ['MATERIAL', 'Subcomponente', 'Item']), '');
    if (!material) return null;
    return {
      id: `${fallback}-${i + 1}`,
      diaInspecao: excelDateToIso(pick(row, map, ['DIA INSPEÇÃO', 'Data da Inspeção', 'Data Inspeção'])),
      semana: text(pick(row, map, ['SEMANA', 'Semana']), ''),
      local: text(pick(row, map, ['LOCAL', 'Local']), ''),
      material,
      codSap: text(pick(row, map, ['COD SAP', 'Código SAP', 'Codigo SAP']), ''),
      fornecedor: text(pick(row, map, ['FORNECEDOR', 'Fornecedor', 'Fábrica', 'Fabrica']), ''),
      lote: text(pick(row, map, ['LOTE', 'Lote']), ''),
      qtdEstoque: num(pick(row, map, ['QTD ESTOQUE', 'Qtd estoque', 'Quantidade estoque'])),
      qtdAmostra: num(pick(row, map, ['QTD AMOSTRA', 'Qtd amostra', 'Amostragem'])),
      qtdInspecionado: num(pick(row, map, ['QTD INSPECIONADO', 'Qtd inspecionado', 'Quantidade inspecionada'])),
      qtdNc: num(pick(row, map, ['QTD NC', 'NC', 'Não conformidade', 'Nao conformidade'])),
      status: text(pick(row, map, ['STATUS BAG/LOTE', 'Status', 'Status lote']), '')
    };
  }).filter(Boolean);
}
function parseWorkbook(wb) {
  const names = wb.SheetNames;
  const estoqueName = names.find((n) => norm(n).includes('ESTOQUE')) || names[0];
  const executadosName = names.find((n) => norm(n).includes('EXECUT')) || names.find((n) => norm(n).includes('INSPE')) || names[1];
  return {
    estoque: parseEstoqueSheet(wb.Sheets[estoqueName], estoqueName),
    executados: parseExecutadosSheet(wb.Sheets[executadosName], executadosName),
    sheetNames: { estoqueName, executadosName }
  };
}
async function importFile(file) {
  if (!file) return;
  state.message = 'Lendo planilha...';
  state.error = '';
  render();
  try {
    if (!window.XLSX) throw new Error('A biblioteca XLSX não carregou. Abra o arquivo com internet ativa para importar novas planilhas.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: false });
    const parsed = parseWorkbook(wb);
    if (!parsed.estoque.length && !parsed.executados.length) throw new Error('Não encontrei as abas/colunas esperadas. Confira se há abas de Estoque e Executados/Inspeções.');
    state.data = { ...parsed, source: file.name, importedAt: new Date().toLocaleString('pt-BR') };
    Object.assign(state, defaultFilters());
    state.active = 'geral';
    state.message = `Planilha importada: ${parsed.estoque.length} registros de estoque e ${parsed.executados.length} inspeções.`;
    state.error = '';
  } catch (err) {
    state.error = err.message || 'Erro ao importar a planilha.';
    state.message = '';
  }
  render();
}
function bind() {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    state.active = btn.dataset.tab;
    state.message = '';
    state.error = '';
    render();
  }));
  document.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('input', () => {
    const [scope, key] = el.dataset.filter.split('.');
    if (scope === 'gen') state.generalFilters[key] = el.value;
    if (scope === 'stock') state.stockFilters[key] = el.value;
    if (scope === 'insp') state.inspFilters[key] = el.value;
    if (scope === 'card') state.cardFilters[key] = el.value;
    render();
  }));
  const file = $('#fileInput');
  if (file) file.addEventListener('change', (e) => importFile(e.target.files[0]));
  const reset = $('#resetBase');
  if (reset) reset.addEventListener('click', () => {
    state.data = emptyDataset();
    Object.assign(state, defaultFilters());
    state.active = 'importar';
    state.message = 'Dados limpos. Importe uma planilha para preencher o painel.';
    state.error = '';
    render();
  });
  const drop = $('#drop');
  if (drop) {
    ['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => importFile(e.dataTransfer.files[0]));
  }
}
function render() {
  const views = {
    importar: renderImport,
    geral: renderGeneral,
    estoque: renderStock,
    inspecoes: renderInspections,
    cards: renderCards
  };
  const active = (views[state.active] || renderGeneral)();
  $('#app').innerHTML = `${header()}<main class="content">${active}</main><footer><span><strong style="color:white">Controle de Qualidade de Subcomponentes</strong></span><span>Importação local: os dados da planilha ficam no navegador.</span></footer>`;
  bind();
}
window.addEventListener('xlsx-ready', () => {
  if (state && state.active === 'importar') render();
});

function init() {
  state = createInitialState();
  render();
}

init();
