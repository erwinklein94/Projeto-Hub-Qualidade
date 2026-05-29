const LIMIT_QTY = 2000;
const LIMIT_LOTS = 10;
const NEAR_QTY = 1800;
const NEAR_LOTS = 9;

const state = {
  production: [],
  rejections: [],
  sourceName: "",
  activeTab: "importTab",
  weeklyReport: {
    selectedPeriod: "",
    manualByPeriod: {}
  }
};

const nf = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseQty(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = clean(value);
  if (!text || text === "-" || text === "?") return 0;
  const normalized = text.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIntSafe(value) {
  const parsed = parseQty(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function excelDateToISO(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value) && value > 20000) {
    const utc = Math.round((value - 25569) * 86400 * 1000);
    return new Date(utc).toISOString().slice(0, 10);
  }
  const text = clean(value);
  if (!text || text === "-" || text === "0") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const br = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${month}-${day}`;
  }
  return "";
}

function formatDate(iso) {
  if (!iso) return "-";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function isValidDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(iso));
}

function compareDateInRange(iso, from, to) {
  if (!isValidDate(iso)) return true;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function isoWeekInfo(iso) {
  if (!isValidDate(iso)) return { label: "Sem data", sort: "9999-99" };
  const date = new Date(`${iso}T00:00:00`);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return {
    label: `Sem. ${String(weekNo).padStart(2, "0")}/${target.getUTCFullYear()}`,
    sort: `${target.getUTCFullYear()}-${String(weekNo).padStart(2, "0")}`
  };
}

function projectCode(project) {
  const key = normalizeKey(project);
  if (key.includes("FERRO")) return "FN";
  if (key.includes("MALHA")) return "MP";
  if (key.includes("FMT")) return "FMT";
  return key.split(" ").map(part => part[0]).join("").slice(0, 4) || "PRJ";
}

function normalizeProjectName(value) {
  const raw = clean(value);
  const key = normalizeKey(raw).replace(/[^A-Z0-9]+/g, "");
  if (!raw || raw === "0" || raw === "-" || raw === "?") return "";
  if (key.includes("FERRONORTE") || (key.includes("FERRO") && key.includes("NORTE"))) return "FERRO NORTE";
  if (key.includes("MALHAPAULISTA")) return "MALHA PAULISTA";
  return raw;
}

function detectBitola(tipo, projeto = "") {
  const text = normalizeKey(`${tipo} ${projeto}`);
  if (/(^|\b)(BL|BITOLA LARGA|LARGA)(\b|$)/.test(text)) return { code: "BL", name: "Bitola Larga" };
  if (/(^|\b)(BM|BITOLA MISTA|MISTA)(\b|$)/.test(text)) return { code: "BM", name: "Bitola Mista" };
  return { code: "SB", name: "Sem bitola identificada" };
}

function groupName(row) {
  const bitola = row.bitola || detectBitola(row.tipo, row.projeto);
  return `${row.projeto || "Sem projeto"} • ${bitola.code}`;
}

function normalizeSerieName(value, project) {
  const raw = clean(value);
  if (!raw || raw === "0" || raw === "-") return `Série aberta / sem série - ${projectCode(project)}`;
  return raw
    .replace(/\s*-\s*/g, " - ")
    .replace(/Série\s+(\d+)/i, (_, n) => `Série ${String(Number(n)).padStart(2, "0")}`)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReason(value, fallback = "") {
  const text = clean(value) && clean(value) !== "0" && clean(value) !== "-" ? clean(value) : clean(fallback);
  const key = normalizeKey(text);
  if (!text || text === "0" || text === "-") return "Sem motivo informado";
  if (key.includes("TRINCA")) return "Trinca";
  if (key.includes("VAZIO")) return "Vazios";
  if (key.includes("OMBREIRA")) return "Ombreira";
  if (key.includes("QUEBRA") || key.includes("TESTEIRA") || key.includes("QUEBRADO")) return "Quebra";
  if (key.includes("VIBRA")) return "Vibração";
  if (key.includes("ENSAIO")) return "Ensaio";
  if (key.includes("OPERACIONAL") || key.includes("OPERAIONAL")) return "Falha operacional";
  if (key.includes("CHUMBADOR")) return "Chumbador";
  if (key.includes("USP")) return "USP";
  return text;
}

function findHeaderRow(rawRows, aliases, startCol = 0, endCol = null) {
  const maxCols = endCol ?? Math.max(...rawRows.map(row => row.length), 0);
  return rawRows.findIndex(row => {
    const headerText = row.slice(startCol, maxCols).map(normalizeKey).join("|");
    return aliases.every(alias => headerText.includes(normalizeKey(alias)));
  });
}

function mapProductionRows(rawRows) {
  if (!rawRows?.length) return [];
  const headerRowIndex = findHeaderRow(rawRows, ["DATA DE FABRICACAO", "LOTE", "PROJETO", "TOTAL"], 0, 7);
  if (headerRowIndex < 0) return [];
  const header = rawRows[headerRowIndex].slice(0, 7).map(normalizeKey);
  const findIndex = (aliases) => header.findIndex(h => aliases.some(alias => h.includes(normalizeKey(alias))));
  const idx = {
    data: findIndex(["DATA DE FABRICACAO", "DATA"]),
    lote: findIndex(["LOTE"]),
    projeto: findIndex(["PROJETO"]),
    tipo: findIndex(["TIPO DE DORMENTE", "TIPO"]),
    quantidade: findIndex(["TOTAL DA PRODUCAO", "TOTAL", "QUANTIDADE"]),
    serie: findIndex(["SERIE", "ENSAIO"])
  };

  return rawRows.slice(headerRowIndex + 1).map((row, i) => {
    const projeto = normalizeProjectName(row[idx.projeto]);
    const lote = parseIntSafe(row[idx.lote]);
    const tipo = clean(row[idx.tipo]);
    const quantidade = parseIntSafe(row[idx.quantidade]);
    if (!projeto || !lote || (!tipo && !quantidade)) return null;
    const bitola = detectBitola(tipo, projeto);
    const data = excelDateToISO(row[idx.data]);
    return {
      data,
      lote,
      projeto,
      tipo,
      quantidade,
      serie: normalizeSerieName(row[idx.serie], projeto),
      bitola,
      grupo: `${projeto} • ${bitola.code}`,
      linhaPlanilha: headerRowIndex + i + 2
    };
  }).filter(Boolean);
}

function mapRejectionRows(rawRows) {
  if (!rawRows?.length) return [];
  const headerRowIndex = findHeaderRow(rawRows, ["SEMANA", "DATA DE PRODUCAO", "LOTE", "MOTIVO"], 7, 19);
  if (headerRowIndex < 0) return [];

  return rawRows.slice(headerRowIndex + 1).map((row, i) => {
    const lote = parseIntSafe(row[11]);
    const projeto = normalizeProjectName(row[12]);
    const tipo = clean(row[13]);
    const motivoDetalhado = clean(row[16]);
    const motivoIndicador = clean(row[17]);
    const hasReason = !["", "0", "-"].includes(motivoDetalhado) || !["", "0", "-"].includes(motivoIndicador);
    if (!lote || !projeto || !hasReason) return null;
    const bitola = detectBitola(tipo, projeto);
    const data = excelDateToISO(row[8]);
    return {
      semanaPlanilha: parseIntSafe(row[7]),
      data,
      periodoInicio: excelDateToISO(row[9]),
      periodoFim: excelDateToISO(row[10]),
      lote,
      projeto,
      tipo,
      bitola,
      grupo: `${projeto} • ${bitola.code}`,
      molde: clean(row[14]) || "-",
      cavidade: clean(row[15]) || "-",
      motivoDetalhado,
      motivoIndicador,
      motivoComum: normalizeReason(motivoIndicador, motivoDetalhado),
      totalSemanaDeclarado: parseIntSafe(row[18]),
      linhaPlanilha: headerRowIndex + i + 2
    };
  }).filter(Boolean);
}

async function parseWorkbookFile(file) {
  if (!window.XLSX) throw new Error("Biblioteca XLSX não carregada. Abra o site com internet ativa para carregar o leitor de planilhas.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
  const production = mapProductionRows(matrix);
  const rejections = mapRejectionRows(matrix);
  if (!production.length && !rejections.length) {
    throw new Error("Não encontrei dados válidos de produção ou refugos/reprovas na primeira aba da planilha.");
  }
  state.production = production;
  state.rejections = rejections;
  state.sourceName = file.name;
  state.weeklyReport = { selectedPeriod: "", manualByPeriod: {} };
  resetFilters();
  populateFilters();
  switchTab("generalTab");
  render();
  const status = $("importStatus");
  if (status) status.textContent = `Importado: ${file.name} • ${nf.format(production.length)} linhas de produção • ${nf.format(rejections.length)} registros de refugo/reprova.`;
}

function resetFilters() {
  ["dashDateFrom", "dashDateTo", "dashSearch", "prodDateFrom", "prodDateTo", "prodSearch", "relDateFrom", "relDateTo", "relSearch", "rejDateFrom", "rejDateTo", "rejLotFilter", "rejSearch"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  ["dashProjectFilter", "prodProjectFilter", "relProjectFilter", "relBitolaFilter", "relStatusFilter", "rejProjectFilter", "rejReasonFilter"].forEach(id => {
    const el = $(id);
    if (el) el.value = "todos";
  });
}

function setOptions(selectId, values, defaultLabel = "Todos") {
  const select = $(selectId);
  if (!select) return;
  const current = select.value || "todos";
  const unique = Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  select.innerHTML = `<option value="todos">${defaultLabel}</option>` + unique.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (unique.includes(current)) select.value = current;
}

function populateFilters() {
  const groups = [...state.production.map(row => row.grupo), ...state.rejections.map(row => row.grupo)];
  setOptions("dashProjectFilter", groups);
  setOptions("prodProjectFilter", state.production.map(row => row.grupo));
  setOptions("relProjectFilter", state.production.map(row => row.projeto));
  setOptions("relBitolaFilter", state.production.map(row => row.bitola?.name || row.bitola?.code), "Todas");
  setOptions("rejProjectFilter", state.rejections.map(row => row.grupo));
  setOptions("rejReasonFilter", state.rejections.map(row => row.motivoComum));
}

function clearData() {
  state.production = [];
  state.rejections = [];
  state.sourceName = "";
  state.weeklyReport = { selectedPeriod: "", manualByPeriod: {} };
  resetFilters();
  populateFilters();
  switchTab("importTab");
  render();
  const status = $("importStatus");
  if (status) status.textContent = "Dados limpos. Importe uma planilha para preencher o painel.";
}

function getDashboardFilters() {
  return {
    from: $("dashDateFrom")?.value || "",
    to: $("dashDateTo")?.value || "",
    project: $("dashProjectFilter")?.value || "todos",
    search: normalizeKey($("dashSearch")?.value || "")
  };
}

function getProductionFilters() {
  return {
    from: $("prodDateFrom")?.value || "",
    to: $("prodDateTo")?.value || "",
    project: $("prodProjectFilter")?.value || "todos",
    serie: "todos",
    status: "todos",
    search: normalizeKey($("prodSearch")?.value || "")
  };
}

function getReleaseFilters() {
  return {
    from: $("relDateFrom")?.value || "",
    to: $("relDateTo")?.value || "",
    project: $("relProjectFilter")?.value || "todos",
    bitola: $("relBitolaFilter")?.value || "todos",
    status: $("relStatusFilter")?.value || "todos",
    search: normalizeKey($("relSearch")?.value || "")
  };
}

function getRejectionFilters() {
  return {
    from: $("rejDateFrom")?.value || "",
    to: $("rejDateTo")?.value || "",
    project: $("rejProjectFilter")?.value || "todos",
    reason: $("rejReasonFilter")?.value || "todos",
    lot: clean($("rejLotFilter")?.value || ""),
    search: normalizeKey($("rejSearch")?.value || "")
  };
}

function filterProduction(rows, filters) {
  return rows.filter(row => {
    if (!compareDateInRange(row.data, filters.from, filters.to)) return false;
    if (filters.project && filters.project !== "todos" && row.grupo !== filters.project) return false;
    if (filters.serie && filters.serie !== "todos" && row.serie !== filters.serie) return false;
    if (filters.search) {
      const haystack = normalizeKey(`${row.data} ${row.lote} ${row.projeto} ${row.tipo} ${row.serie} ${row.grupo}`);
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
}

function filterReleaseProduction(rows, filters) {
  return rows.filter(row => {
    if (!compareDateInRange(row.data, filters.from, filters.to)) return false;
    if (filters.project && filters.project !== "todos" && row.projeto !== filters.project) return false;
    if (filters.bitola && filters.bitola !== "todos" && row.bitola?.name !== filters.bitola && row.bitola?.code !== filters.bitola) return false;
    if (filters.search) {
      const haystack = normalizeKey(`${row.data} ${row.lote} ${row.projeto} ${row.tipo} ${row.serie} ${row.grupo}`);
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
}

function filterRejections(rows, filters) {
  return rows.filter(row => {
    if (!compareDateInRange(row.data, filters.from, filters.to)) return false;
    if (filters.project && filters.project !== "todos" && row.grupo !== filters.project) return false;
    if (filters.reason && filters.reason !== "todos" && row.motivoComum !== filters.reason) return false;
    if (filters.lot && !String(row.lote).includes(filters.lot)) return false;
    if (filters.search) {
      const haystack = normalizeKey(`${row.data} ${row.lote} ${row.projeto} ${row.tipo} ${row.molde} ${row.cavidade} ${row.motivoDetalhado} ${row.motivoIndicador} ${row.motivoComum}`);
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
}

function dashboardProduction() {
  const filters = getDashboardFilters();
  return filterProduction(state.production, filters);
}

function dashboardRejections() {
  const filters = getDashboardFilters();
  return filterRejections(state.rejections, { ...filters, reason: "todos", lot: "" });
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function countUnique(rows, mapper) {
  return new Set(rows.map(mapper).filter(Boolean)).size;
}

function groupBy(rows, keyFn, valueFn = () => 1) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + valueFn(row));
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function topItems(items, limit = 8) {
  return [...items].sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name), "pt-BR", { numeric: true })).slice(0, limit);
}

function emptyState(title = "Nenhum dado para exibir", text = "Importe uma planilha ou ajuste os filtros.") {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div></div>`;
}

function kpi(label, value, note = "") {
  return `<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</article>`;
}

function renderKpis(targetId, kpis) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = kpis.join("");
}

function renderRankList(targetId, items, options = {}) {
  const target = $(targetId);
  if (!target) return;
  const { limit = 8, valueLabel = (value) => nf.format(value), meta = () => "", trackClass = "" } = options;
  const ranked = topItems(items, limit);
  if (!ranked.length) {
    target.innerHTML = emptyState();
    return;
  }
  const max = Math.max(...ranked.map(item => Math.abs(item.value)), 1);
  target.innerHTML = `<div class="rank-list">${ranked.map(item => {
    const width = Math.max(2, Math.min(100, Math.abs(item.value) / max * 100));
    const metaText = meta(item);
    return `<div class="rank-row">
      <div class="rank-name">${escapeHtml(item.name)}${metaText ? `<span class="rank-meta">${escapeHtml(metaText)}</span>` : ""}</div>
      <div class="progress-track ${trackClass}"><span style="width:${width}%"></span></div>
      <div class="rank-value">${escapeHtml(valueLabel(item.value, item))}</div>
    </div>`;
  }).join("")}</div>`;
}

function makeWeeklyData(productionRows, rejectionRows) {
  const map = new Map();
  productionRows.forEach(row => {
    const week = isoWeekInfo(row.data);
    const item = map.get(week.sort) || { sort: week.sort, label: week.label, production: 0, rejections: 0 };
    item.production += row.quantidade || 0;
    map.set(week.sort, item);
  });
  rejectionRows.forEach(row => {
    const week = isoWeekInfo(row.data);
    const item = map.get(week.sort) || { sort: week.sort, label: week.label, production: 0, rejections: 0 };
    item.rejections += 1;
    map.set(week.sort, item);
  });
  return Array.from(map.values()).sort((a, b) => a.sort.localeCompare(b.sort)).slice(-16);
}

function axisLabels(maxValue) {
  const max = Math.max(1, maxValue);
  return [max, max * .75, max * .5, max * .25, 0].map(value => nf.format(Math.round(value)));
}

function verticalChartHtml(rows, seriesConfig, options = {}) {
  if (!rows.length) return emptyState(options.emptyTitle || "Nenhum dado para exibir", options.emptyText || "Importe uma planilha ou ajuste os filtros.");
  const max = Math.max(...rows.flatMap(row => seriesConfig.map(series => Number(row[series.field]) || 0)), 1);
  const title = options.title ? `<div class="chart-title"><span>${escapeHtml(options.title)}</span><span>Máx.: ${nf.format(max)}</span></div>` : "";
  const barsHtml = rows.map(row => `<div class="bar-group">
    <div class="bar-area">
      ${seriesConfig.map(series => {
        const value = Number(row[series.field]) || 0;
        const height = Math.max(value > 0 ? 2 : 0, value / max * 100);
        return `<div class="vbar ${series.className || ""}" title="${escapeHtml(series.label)}: ${nf.format(value)}" style="height:${height}%; --h:${height}%"></div>`;
      }).join("")}
    </div>
    <div class="bar-label">${escapeHtml(row.label)}</div>
  </div>`).join("");
  const legend = `<div class="legend">${seriesConfig.map(series => `<span><i class="${series.className?.includes("yellow") ? "yellow" : ""}"></i>${escapeHtml(series.label)}</span>`).join("")}</div>`;
  return `<div class="chart-wrap">${title}<div class="vertical-chart"><div class="y-axis">${axisLabels(max).map(label => `<span>${label}</span>`).join("")}</div><div class="bars">${barsHtml}</div></div>${legend}</div>`;
}

function renderVerticalChart(targetId, rows, seriesConfig, options = {}) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = verticalChartHtml(rows, seriesConfig, options);
}

function productionMapByLot(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = String(row.lote);
    const item = map.get(key) || { lote: row.lote, projeto: row.projeto, tipo: row.tipo, grupo: row.grupo, quantidade: 0 };
    item.quantidade += row.quantidade || 0;
    map.set(key, item);
  });
  return map;
}

function makeCriticalLots(productionRows, rejectionRows) {
  const prodByLot = productionMapByLot(productionRows);
  const rejByLot = new Map();
  rejectionRows.forEach(row => {
    const key = String(row.lote);
    const current = rejByLot.get(key) || { lote: row.lote, projeto: row.projeto, tipo: row.tipo, grupo: row.grupo, rejections: 0 };
    current.rejections += 1;
    rejByLot.set(key, current);
  });
  return Array.from(rejByLot.values()).map(item => {
    const prod = prodByLot.get(String(item.lote));
    const quantidade = prod?.quantidade || 0;
    const taxa = quantidade ? item.rejections / quantidade * 100 : 0;
    return {
      ...item,
      quantidade,
      value: item.rejections,
      taxa,
      name: `Lote ${item.lote}`,
      meta: `${item.grupo} • ${item.tipo || "tipo não informado"} • produção ${nf.format(quantidade)} • taxa ${pct.format(taxa)}%`
    };
  }).sort((a, b) => b.rejections - a.rejections || b.taxa - a.taxa).slice(0, 8);
}

function computeSeries(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = `${row.grupo}|||${row.serie}`;
    const item = map.get(key) || {
      key,
      grupo: row.grupo,
      serie: row.serie,
      projeto: row.projeto,
      tipo: row.tipo,
      quantidade: 0,
      lots: new Set(),
      rows: []
    };
    item.quantidade += row.quantidade || 0;
    item.lots.add(row.lote);
    item.rows.push(row);
    map.set(key, item);
  });
  return Array.from(map.values()).map(item => {
    const lotCount = item.lots.size;
    let status = "andamento";
    let label = "Em andamento";
    if (item.quantidade <= 0 && lotCount <= 0) { status = "planejado"; label = "Planejado"; }
    else if (item.quantidade >= LIMIT_QTY || lotCount >= LIMIT_LOTS) { status = "ensaio"; label = "Ensaio obrigatório"; }
    else if (item.quantidade >= NEAR_QTY || lotCount >= NEAR_LOTS) { status = "proximo"; label = "Próximo do ensaio"; }
    return { ...item, lotCount, status, label };
  }).sort((a, b) => {
    const priority = { ensaio: 0, proximo: 1, andamento: 2, planejado: 3 };
    return priority[a.status] - priority[b.status] || b.quantidade - a.quantidade;
  });
}


function releaseCycleKey(row) {
  return `${row.projeto || "Sem projeto"}|||${row.serie || normalizeSerieName("", row.projeto)}`;
}

function isOpenReleaseSerie(serie) {
  const key = normalizeKey(serie);
  return !key || key.includes("SERIE ABERTA") || key === "0" || key === "SEM SERIE";
}

function releaseSerieNumber(serie) {
  const match = clean(serie).match(/s[ée]rie\s*(\d+)/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function minDate(rows) {
  const dates = rows.map(row => row.data).filter(isValidDate).sort();
  return dates[0] || "";
}

function maxDate(rows) {
  const dates = rows.map(row => row.data).filter(isValidDate).sort();
  return dates.at(-1) || "";
}

function releaseTriggerLabel(quantidade, lotCount) {
  const hitQty = quantidade >= LIMIT_QTY;
  const hitLots = lotCount >= LIMIT_LOTS;
  if (hitQty && hitLots) return "2.000 dormentes e 10 lotes";
  if (hitQty) return "2.000 dormentes";
  if (hitLots) return "10 lotes";
  return "Aguardando gatilho";
}

function computeReleaseCycles(rows) {
  const ordered = [...rows].sort((a, b) => {
    return String(a.projeto).localeCompare(String(b.projeto), "pt-BR", { numeric: true })
      || releaseSerieNumber(a.serie) - releaseSerieNumber(b.serie)
      || String(a.data).localeCompare(String(b.data))
      || Number(a.lote) - Number(b.lote)
      || Number(a.linhaPlanilha) - Number(b.linhaPlanilha);
  });
  const map = new Map();
  ordered.forEach(row => {
    const key = releaseCycleKey(row);
    const item = map.get(key) || {
      key,
      projeto: row.projeto || "Sem projeto",
      serie: row.serie || normalizeSerieName("", row.projeto),
      quantidade: 0,
      lots: new Set(),
      tipos: new Set(),
      bitolas: new Set(),
      rows: []
    };
    item.quantidade += row.quantidade || 0;
    if (row.lote) item.lots.add(row.lote);
    if (row.tipo) item.tipos.add(row.tipo);
    if (row.bitola?.code) item.bitolas.add(row.bitola.code);
    item.rows.push(row);
    map.set(key, item);
  });

  return Array.from(map.values()).map(item => {
    const lotCount = item.lots.size;
    const quantidade = item.quantidade || 0;
    const qtyPct = Math.min(100, quantidade / LIMIT_QTY * 100);
    const lotPct = Math.min(100, lotCount / LIMIT_LOTS * 100);
    const progress = Math.max(qtyPct, lotPct);
    let status = "andamento";
    let label = "Em contagem";
    if (quantidade >= LIMIT_QTY || lotCount >= LIMIT_LOTS) { status = "ensaio"; label = "Ensaio obrigatório"; }
    else if (quantidade >= NEAR_QTY || lotCount >= NEAR_LOTS) { status = "proximo"; label = "Próximo do ensaio"; }

    const lotRows = Array.from(item.rows.reduce((lotMap, row) => {
      const lotKey = String(row.lote || "Sem lote");
      const lot = lotMap.get(lotKey) || {
        lote: row.lote || "Sem lote",
        datas: new Set(),
        tipos: new Set(),
        quantidade: 0,
        linhaPlanilha: row.linhaPlanilha
      };
      if (row.data) lot.datas.add(row.data);
      if (row.tipo) lot.tipos.add(row.tipo);
      lot.quantidade += row.quantidade || 0;
      lotMap.set(lotKey, lot);
      return lotMap;
    }, new Map()).values()).map(lot => {
      const datas = Array.from(lot.datas).sort();
      return {
        lote: lot.lote,
        data: datas[0] || "",
        tipos: Array.from(lot.tipos).join(" / ") || "-",
        quantidade: lot.quantidade,
        linhaPlanilha: lot.linhaPlanilha
      };
    }).sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.lote) - Number(b.lote) || Number(a.linhaPlanilha) - Number(b.linhaPlanilha));

    return {
      ...item,
      lotCount,
      quantidade,
      qtyPct,
      lotPct,
      progress,
      status,
      label,
      gatilho: releaseTriggerLabel(quantidade, lotCount),
      saldoQuantidade: Math.max(0, LIMIT_QTY - quantidade),
      saldoLotes: Math.max(0, LIMIT_LOTS - lotCount),
      primeiraData: minDate(item.rows),
      ultimaData: maxDate(item.rows),
      bitolaResumo: Array.from(item.bitolas).sort().join(" / ") || "-",
      tipoResumo: Array.from(item.tipos).slice(0, 3).join(" / ") || "-",
      aberta: isOpenReleaseSerie(item.serie),
      ultimoLote: lotRows.length ? lotRows[lotRows.length - 1].lote : "",
      lotRows
    };
  }).sort((a, b) => {
    const priority = { ensaio: 0, proximo: 1, andamento: 2 };
    return priority[a.status] - priority[b.status]
      || b.progress - a.progress
      || String(a.projeto).localeCompare(String(b.projeto), "pt-BR", { numeric: true })
      || releaseSerieNumber(a.serie) - releaseSerieNumber(b.serie);
  });
}

function renderHeaderStats() {
  const production = state.production;
  const rejections = state.rejections;
  const totalProduction = sum(production, "quantidade");
  const lotCount = countUnique(production, row => row.lote);
  const rate = totalProduction ? rejections.length / totalProduction * 100 : 0;
  $("topProduction").textContent = nf.format(totalProduction);
  $("topLots").textContent = nf.format(lotCount);
  $("topRejectRate").textContent = `${pct.format(rate)}%`;
  const pill = $("sourcePill");
  if (pill) {
    pill.classList.toggle("is-loaded", Boolean(state.sourceName));
    pill.innerHTML = `<span></span>${state.sourceName ? `Base atual: ${escapeHtml(state.sourceName)}` : "Nenhuma planilha importada"}`;
  }
}

function renderGeneral() {
  const production = dashboardProduction();
  const rejections = dashboardRejections();
  const totalProduction = sum(production, "quantidade");
  const lotCount = countUnique(production, row => row.lote);
  const rejectRate = totalProduction ? rejections.length / totalProduction * 100 : 0;
  const series = computeSeries(production);
  const mandatorySeries = series.filter(item => item.status === "ensaio").length;
  renderKpis("generalKpis", [
    kpi("Produção", nf.format(totalProduction), "dormentes no recorte"),
    kpi("Lotes", nf.format(lotCount), "lotes produzidos"),
    kpi("Refugos / reprovas", nf.format(rejections.length), "ocorrências registradas"),
    kpi("Taxa refugo", `${pct.format(rejectRate)}%`, "ocorrências / produção"),
    kpi("Séries em ensaio", nf.format(mandatorySeries), "atingiram o gatilho")
  ]);

  const weekly = makeWeeklyData(production, rejections);
  const weeklyTarget = $("weeklyQualityChart");
  if (weeklyTarget) {
    weeklyTarget.innerHTML = `<div class="chart-wrap">
      ${verticalChartHtml(weekly, [{ field: "production", label: "Produção" }], { title: "Produção semanal" })}
      ${verticalChartHtml(weekly, [{ field: "rejections", label: "Refugos/Reprovas", className: "vbar--yellow" }], { title: "Refugos/Reprovas semanais" })}
    </div>`;
  }

  renderRankList("productionByProject", groupBy(production, row => row.grupo, row => row.quantidade || 0), {
    valueLabel: value => nf.format(value),
    meta: item => "dormentes produzidos"
  });
  renderRankList("rejectionByReason", groupBy(rejections, row => row.motivoComum), {
    valueLabel: value => `${nf.format(value)} ocorr.` ,
    trackClass: "progress-track--yellow"
  });

  const critical = makeCriticalLots(production, rejections).map(item => ({ name: item.name, value: item.rejections, meta: item.meta }));
  renderRankList("criticalLots", critical, {
    valueLabel: value => `${nf.format(value)} ocorr.` ,
    meta: item => item.meta,
    trackClass: "progress-track--yellow"
  });

  renderInsights(production, rejections, series);
}

function renderInsights(production, rejections, series) {
  const target = $("qualityInsights");
  if (!target) return;
  if (!production.length && !rejections.length) {
    target.innerHTML = emptyState();
    return;
  }
  const topReason = topItems(groupBy(rejections, row => row.motivoComum), 1)[0];
  const topMold = topItems(groupBy(rejections, row => row.molde && row.molde !== "-" ? `Molde ${row.molde}` : "Molde não informado"), 1)[0];
  const topMaterial = topItems(groupBy(rejections, row => row.tipo || "Tipo não informado"), 1)[0];
  const nextSeries = [...series].filter(item => item.status === "proximo" || item.status === "ensaio")[0];
  target.innerHTML = `<div class="insight-grid">
    <div class="insight"><span>Motivo líder</span><strong>${escapeHtml(topReason?.name || "Sem NC")}</strong><small>${topReason ? `${nf.format(topReason.value)} ocorrências no recorte.` : "Nenhuma ocorrência encontrada."}</small></div>
    <div class="insight"><span>Molde crítico</span><strong>${escapeHtml(topMold?.name || "Sem molde")}</strong><small>${topMold ? `${nf.format(topMold.value)} ocorrências vinculadas.` : "Nenhuma ocorrência encontrada."}</small></div>
    <div class="insight"><span>Material com NC</span><strong>${escapeHtml(topMaterial?.name || "Sem material")}</strong><small>${topMaterial ? `${nf.format(topMaterial.value)} ocorrências registradas.` : "Nenhuma ocorrência encontrada."}</small></div>
    <div class="insight"><span>Série mais urgente</span><strong>${escapeHtml(nextSeries ? `${nextSeries.grupo} • ${nextSeries.serie}` : "Sem alerta")}</strong><small>${nextSeries ? `${nf.format(nextSeries.quantidade)} peças e ${nf.format(nextSeries.lotCount)} lotes.` : "Nenhuma série próxima do gatilho."}</small></div>
  </div>`;
}


function escapePreserveHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dateFromIsoLocal(iso) {
  if (!isValidDate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(iso, days) {
  const date = dateFromIsoLocal(iso);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return isoFromDateLocal(date);
}

function thursdayWeekStart(iso) {
  const date = dateFromIsoLocal(iso);
  if (!date) return "";
  const diff = (date.getDay() - 4 + 7) % 7;
  date.setDate(date.getDate() - diff);
  return isoFromDateLocal(date);
}

function shortDate(iso) {
  if (!isValidDate(iso)) return "__/__";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function weekNumberFromThursdayPeriod(startIso) {
  const endIso = addDaysIso(startIso, 6);
  const info = isoWeekInfo(endIso);
  const number = Number(String(info.sort || "").split("-")[1]);
  return Number.isFinite(number) && number > 0 ? number : "-";
}

function periodLabel(startIso) {
  const endIso = addDaysIso(startIso, 6);
  return `Semana ${weekNumberFromThursdayPeriod(startIso)} — ${formatDate(startIso)} a ${formatDate(endIso)}`;
}

function makeWeeklyReportPeriods() {
  const dates = [...state.production, ...state.rejections]
    .map(row => row.data)
    .filter(isValidDate);
  const map = new Map();
  dates.forEach(iso => {
    const start = thursdayWeekStart(iso);
    if (!start) return;
    map.set(start, {
      key: start,
      start,
      end: addDaysIso(start, 6),
      nextStart: addDaysIso(start, 7),
      nextEnd: addDaysIso(start, 13),
      weekNumber: weekNumberFromThursdayPeriod(start)
    });
  });
  return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
}

function rowsInWeeklyPeriod(rows, startIso) {
  const endIso = addDaysIso(startIso, 6);
  return rows.filter(row => isValidDate(row.data) && row.data >= startIso && row.data <= endIso);
}

function weeklyReasonText(rejections) {
  if (!rejections.length) return "Sem refugos registrados: 0";
  const map = new Map();
  rejections.forEach(row => {
    const reason = clean(row.motivoDetalhado || row.motivoIndicador || row.motivoComum || "Sem motivo informado");
    map.set(reason, (map.get(reason) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
    .map(([reason, value]) => `${reason}: ${nf.format(value)}`)
    .join("\n");
}


function sortLotValues(values) {
  return Array.from(new Set(values.filter(value => clean(value))))
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
}

function weeklyProducedLotsText(productionRows) {
  if (!productionRows.length) return "Sem lotes produzidos no período selecionado.";
  const map = new Map();
  productionRows.forEach(row => {
    const project = clean(row.grupo || row.projeto || row.tipo || "Projeto não informado");
    const item = map.get(project) || { project, lots: [] };
    if (row.lote) item.lots.push(String(row.lote));
    map.set(project, item);
  });
  const groups = Array.from(map.values())
    .map(item => ({ ...item, lots: sortLotValues(item.lots) }))
    .filter(item => item.lots.length)
    .sort((a, b) => a.project.localeCompare(b.project, "pt-BR", { numeric: true }));
  if (!groups.length) return "Sem lotes informados no período selecionado.";
  return groups.map(item => `${item.project}: ${item.lots.map(lot => `*${lot}*`).join(", ")}`).join("\n");
}

function weeklyProducedLotsPlainHtml(productionRows) {
  const text = weeklyProducedLotsText(productionRows);
  return escapeHtml(text);
}


function weeklyProjectAverageRows(productionRows) {
  const map = new Map();
  productionRows.forEach(row => {
    const project = clean(row.grupo || row.projeto || row.tipo || "Projeto não informado");
    const item = map.get(project) || { project, total: 0, lots: new Set(), days: new Set() };
    item.total += row.quantidade || 0;
    if (row.lote) item.lots.add(String(row.lote));
    if (row.data) item.days.add(row.data);
    map.set(project, item);
  });
  return Array.from(map.values())
    .map(item => {
      const dayCount = Math.max(item.days.size, 1);
      const lotCount = Math.max(item.lots.size, 1);
      return {
        project: item.project,
        total: item.total,
        dayCount: item.days.size,
        lotCount: item.lots.size,
        averagePerProductionDay: item.total / dayCount,
        averagePerLot: item.total / lotCount
      };
    })
    .filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total || a.project.localeCompare(b.project, "pt-BR", { numeric: true }));
}

function weeklyProjectAveragesHtml(projectAverages) {
  if (!projectAverages.length) {
    return `<div class="empty-state weekly-report__mini-empty"><strong>Sem produção no período</strong><span>Selecione uma semana com produção para ver as médias por projeto/bitola.</span></div>`;
  }
  return `<div class="weekly-average-list">${projectAverages.map(item => `<div class="weekly-average-row">
    <div class="weekly-average-row__name">${escapeHtml(item.project)}</div>
    <div><span>Total semana</span><strong>${nf.format(Math.round(item.total))}</strong></div>
    <div><span>Média por dia produzido</span><strong>${nf.format(Math.round(item.averagePerProductionDay))}</strong></div>
    <div><span>Média por lote</span><strong>${nf.format(Math.round(item.averagePerLot))}</strong></div>
    <div><span>Lotes / dias</span><strong>${nf.format(item.lotCount)} / ${nf.format(item.dayCount)}</strong></div>
  </div>`).join("")}</div>`;
}

function countWeeklyReleaseTests(productionRows) {
  return new Set(productionRows
    .filter(row => row.serie && !isOpenReleaseSerie(row.serie))
    .map(row => `${row.projeto}|${row.serie}`)
  ).size;
}

function getWeeklyReportAutoData(startIso) {
  const period = {
    key: startIso,
    start: startIso,
    end: addDaysIso(startIso, 6),
    nextStart: addDaysIso(startIso, 7),
    nextEnd: addDaysIso(startIso, 13),
    weekNumber: weekNumberFromThursdayPeriod(startIso)
  };
  const productionRows = rowsInWeeklyPeriod(state.production, startIso);
  const rejectionRows = rowsInWeeklyPeriod(state.rejections, startIso);
  const productionTotal = sum(productionRows, "quantidade");
  const tests = countWeeklyReleaseTests(productionRows);
  return {
    period,
    productionRows,
    rejectionRows,
    productionTotal,
    tests,
    rejections: rejectionRows.length,
    reasonText: weeklyReasonText(rejectionRows),
    lotsText: weeklyProducedLotsText(productionRows),
    projectAverages: weeklyProjectAverageRows(productionRows),
    defaultCavanDate: addDaysIso(period.end, 2)
  };
}

function getWeeklyManual(startIso, auto) {
  if (!state.weeklyReport.manualByPeriod[startIso]) {
    state.weeklyReport.manualByPeriod[startIso] = {
      cavanDate: auto.defaultCavanDate,
      tests: String(auto.tests),
      reasonText: auto.reasonText,
      analysis: "",
      lotNotes: "",
      nextPlanned: ""
    };
  }
  return state.weeklyReport.manualByPeriod[startIso];
}

function formatFreeNumber(value) {
  const text = clean(value);
  if (!text) return "";
  const parsed = parseQty(text);
  return Number.isFinite(parsed) && parsed !== 0 ? nf.format(parsed) : text;
}

function generateWeeklyReportText(auto, manual) {
  const p = auto.period;
  const reportDate = manual.cavanDate ? formatDate(manual.cavanDate) : "";
  const tests = formatFreeNumber(manual.tests);
  const nextPlanned = formatFreeNumber(manual.nextPlanned);
  const lines = [];
  lines.push(`*Produção Semana ${p.weekNumber}*`);
  lines.push("");
  lines.push(`*CAVAN${reportDate ? ` - ${reportDate}` : ""}*`);
  lines.push("");
  lines.push(`Produzidos na semana (${shortDate(p.start)}) a (${shortDate(p.end)}): ${nf.format(auto.productionTotal)}`);
  lines.push("");
  lines.push("*Lotes produzidos na semana:*");
  lines.push(auto.lotsText || "Sem lotes produzidos no período selecionado.");
  lines.push("");
  lines.push(`Quantidade de ensaios realizados (${shortDate(p.start)}) a (${shortDate(p.end)}): ${tests || "0"}`);
  lines.push(`Refugos: ${nf.format(auto.rejections)}`);
  lines.push("");
  lines.push("*Motivo dos refugos:*");
  lines.push(manual.reasonText || "Sem refugos registrados: 0");
  lines.push("");
  lines.push(`Análise:${manual.analysis ? ` ${manual.analysis}` : ""}`);
  if (manual.lotNotes) {
    lines.push("");
    lines.push(manual.lotNotes);
  }
  lines.push("");
  lines.push(`*Previsto para próxima semana (${shortDate(p.nextStart)}) a (${shortDate(p.nextEnd)}):* ${nextPlanned ? `*${nextPlanned}*` : ""}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function currentWeeklyReportContext() {
  const periods = makeWeeklyReportPeriods();
  if (!periods.length) return null;
  if (!state.weeklyReport.selectedPeriod || !periods.some(period => period.key === state.weeklyReport.selectedPeriod)) {
    state.weeklyReport.selectedPeriod = periods[0].key;
  }
  const auto = getWeeklyReportAutoData(state.weeklyReport.selectedPeriod);
  const manual = getWeeklyManual(state.weeklyReport.selectedPeriod, auto);
  return { periods, auto, manual };
}

function setWeeklyReportStatus(message) {
  const status = $("weeklyReportStatus");
  if (status) status.textContent = message || "";
}

function updateWeeklyManualFromDom() {
  const context = currentWeeklyReportContext();
  if (!context) return;
  const manual = context.manual;
  $$('[data-weekly-field]').forEach(input => {
    manual[input.dataset.weeklyField] = input.value;
  });
  refreshWeeklyReportOutput();
}

function refreshWeeklyReportOutput() {
  const context = currentWeeklyReportContext();
  const output = $("weeklyReportOutput");
  if (!context || !output) return;
  output.value = generateWeeklyReportText(context.auto, context.manual);
}

function setupWeeklyReportEvents() {
  const select = $("weeklyReportWeekSelect");
  if (select) {
    select.addEventListener("change", () => {
      state.weeklyReport.selectedPeriod = select.value;
      renderWeeklyProductionReport();
    });
  }
  $$('[data-weekly-field]').forEach(input => {
    input.addEventListener("input", updateWeeklyManualFromDom);
  });
  $("copyWeeklyReportBtn")?.addEventListener("click", copyWeeklyReportText);
  $("exportWeeklyReportPdfBtn")?.addEventListener("click", exportWeeklyReportPdf);
}

async function copyWeeklyReportText() {
  const output = $("weeklyReportOutput");
  const text = output?.value || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setWeeklyReportStatus("Texto copiado. Agora é só colar no WhatsApp.");
  } catch (error) {
    output.focus();
    output.select();
    const ok = document.execCommand("copy");
    setWeeklyReportStatus(ok ? "Texto copiado. Agora é só colar no WhatsApp." : "Selecione o texto e copie manualmente.");
  }
}

function exportWeeklyReportPdf() {
  const output = $("weeklyReportOutput");
  const text = output?.value || "";
  if (!text) return;
  const win = window.open("", "_blank", "width=900,height=720");
  if (!win) {
    alert("Não consegui abrir a janela de impressão. Libere pop-ups para exportar o PDF.");
    return;
  }
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Produção semanal</title><style>
    body{font-family:"Cera Pro", Verdana, Geneva, Tahoma, sans-serif;margin:32px;color:#003865;}
    h1{font-size:22px;margin:0 0 18px;}
    pre{white-space:pre-wrap;font-family:"Cera Pro", Verdana, Geneva, Tahoma, sans-serif;font-size:14px;line-height:1.5;border:1px solid #D7E0E5;border-radius:14px;padding:20px;}
    @media print{body{margin:18mm;} pre{border:0;padding:0;}}
  </style></head><body><h1>Anotação semanal de produção</h1><pre>${escapePreserveHtml(text)}</pre><script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});<\/script></body></html>`);
  win.document.close();
  setWeeklyReportStatus("Janela de impressão aberta. Escolha “Salvar como PDF”.");
}

function renderWeeklyProductionReport() {
  const target = $("weeklyProductionReport");
  if (!target) return;
  const context = currentWeeklyReportContext();
  if (!context) {
    target.innerHTML = emptyState("Sem semanas para gerar relatório", "Importe uma planilha com datas de produção ou refugo para montar a anotação semanal.");
    return;
  }
  const { periods, auto, manual } = context;
  const p = auto.period;
  const outputText = generateWeeklyReportText(auto, manual);
  target.innerHTML = `<div class="weekly-report">
    <div class="weekly-report__filters">
      <label>Semana quinta a quarta
        <select id="weeklyReportWeekSelect">${periods.map(period => `<option value="${escapeHtml(period.key)}" ${period.key === state.weeklyReport.selectedPeriod ? "selected" : ""}>${escapeHtml(periodLabel(period.start))}</option>`).join("")}</select>
      </label>
      <label>Data do relatório CAVAN
        <input type="date" data-weekly-field="cavanDate" value="${escapeHtml(manual.cavanDate || "")}" />
      </label>
      <label>Ensaios realizados
        <input type="number" min="0" step="1" data-weekly-field="tests" value="${escapeHtml(manual.tests ?? String(auto.tests))}" />
      </label>
      <label>Previsto próxima semana
        <input data-weekly-field="nextPlanned" placeholder="Ex.: 6600" value="${escapeHtml(manual.nextPlanned || "")}" />
      </label>
    </div>

    <div class="weekly-report__auto">
      <div class="weekly-report__auto-card"><span>Período usado</span><strong>${escapeHtml(shortDate(p.start))} a ${escapeHtml(shortDate(p.end))}</strong></div>
      <div class="weekly-report__auto-card"><span>Produção automática</span><strong>${nf.format(auto.productionTotal)}</strong></div>
      <div class="weekly-report__auto-card"><span>Refugos automáticos</span><strong>${nf.format(auto.rejections)}</strong></div>
    </div>

    <div class="weekly-report__lots">
      <label>Relação automática dos lotes produzidos na semana
        <textarea id="weeklyReportLotsText" readonly></textarea>
      </label>
    </div>

    <div class="weekly-report__averages">
      <div class="weekly-report__section-head">
        <h4>Média de produção por projeto/bitola</h4>
        <p>Informação de apoio para prever a próxima semana. Não entra no texto copiado nem no PDF.</p>
      </div>
      ${weeklyProjectAveragesHtml(auto.projectAverages || [])}
    </div>

    <div class="weekly-report__manual">
      <label class="weekly-report__field--wide">Motivos dos refugos
        <textarea data-weekly-field="reasonText" id="weeklyReportReasonText"></textarea>
      </label>
      <label class="weekly-report__field--wide">Análise
        <textarea data-weekly-field="analysis" id="weeklyReportAnalysis" placeholder="Ex.: 23 Unid (08/05 Lote *2831*)"></textarea>
      </label>
      <label class="weekly-report__field--wide">Observações dos lotes
        <textarea data-weekly-field="lotNotes" id="weeklyReportLotNotes" placeholder="Ex.: *2838* Travado\n\n*2839* Molde 008 Cav 1.2.3.4.5.6"></textarea>
      </label>
    </div>

    <div class="weekly-report__preview">
      <label>Texto pronto para WhatsApp ou PDF
        <textarea id="weeklyReportOutput" readonly></textarea>
      </label>
      <div class="weekly-report__actions">
        <button class="btn btn--primary" type="button" id="copyWeeklyReportBtn">Copiar para WhatsApp</button>
        <button class="btn btn--ghost" type="button" id="exportWeeklyReportPdfBtn">Exportar PDF deste relatório</button>
        <span class="weekly-report__status" id="weeklyReportStatus"></span>
      </div>
    </div>
  </div>`;
  $("weeklyReportLotsText").value = auto.lotsText || "";
  $("weeklyReportReasonText").value = manual.reasonText || "";
  $("weeklyReportAnalysis").value = manual.analysis || "";
  $("weeklyReportLotNotes").value = manual.lotNotes || "";
  $("weeklyReportOutput").value = outputText;
  setupWeeklyReportEvents();
}

function renderProduction() {
  const filters = getProductionFilters();
  const rows = filterProduction(state.production, filters);
  const totalProduction = sum(rows, "quantidade");
  const lotCount = countUnique(rows, row => row.lote);
  renderKpis("productionKpis", [
    kpi("Produção", nf.format(totalProduction), "dormentes filtrados"),
    kpi("Lotes", nf.format(lotCount), "lotes únicos"),
    kpi("Projetos / bitolas", nf.format(countUnique(rows, row => row.grupo)), "famílias filtradas"),
    kpi("Tipos de dormente", nf.format(countUnique(rows, row => row.tipo)), "modelos filtrados")
  ]);

  renderRankList("productionBalance", groupBy(rows, row => row.grupo, row => row.quantidade || 0), {
    limit: 12,
    valueLabel: value => nf.format(value),
    meta: item => "dormentes produzidos"
  });

  const weekly = Array.from(rows.reduce((map, row) => {
    const week = isoWeekInfo(row.data);
    const item = map.get(week.sort) || { sort: week.sort, label: week.label, production: 0 };
    item.production += row.quantidade || 0;
    map.set(week.sort, item);
    return map;
  }, new Map()).values()).sort((a, b) => a.sort.localeCompare(b.sort)).slice(-16);
  renderVerticalChart("productionWeeklyChart", weekly, [{ field: "production", label: "Produção" }]);
  renderProductionTable(rows.slice(0, 160));
  renderWeeklyProductionReport();
}

function renderSeriesCards(series) {
  const target = $("seriesCards");
  if (!target) return;
  if (!series.length) {
    target.innerHTML = emptyState("Nenhuma série encontrada", "Importe uma planilha ou ajuste os filtros.");
    return;
  }
  target.innerHTML = `<div class="series-list">${series.map(item => {
    const qtyPct = Math.min(100, (item.quantidade || 0) / LIMIT_QTY * 100);
    const lotPct = Math.min(100, (item.lotCount || 0) / LIMIT_LOTS * 100);
    return `<article class="series-card">
      <div class="series-card__top">
        <div><h4>${escapeHtml(item.grupo)} • ${escapeHtml(item.serie)}</h4><p>${nf.format(item.quantidade)} dormentes • ${nf.format(item.lotCount)} lotes</p></div>
        <span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.label)}</span>
      </div>
      <div class="series-progress">
        <div><div class="progress-label"><span>Quantidade</span><span>${nf.format(item.quantidade)} / ${nf.format(LIMIT_QTY)}</span></div><div class="progress-track"><span style="width:${qtyPct}%"></span></div></div>
        <div><div class="progress-label"><span>Lotes</span><span>${nf.format(item.lotCount)} / ${nf.format(LIMIT_LOTS)}</span></div><div class="progress-track progress-track--yellow"><span style="width:${lotPct}%"></span></div></div>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function renderProductionTable(rows) {
  const target = $("productionTable");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = emptyState();
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Data</th><th>Lote</th><th>Projeto / Bitola</th><th>Tipo de dormente</th><th>Quantidade</th></tr></thead>
    <tbody>${rows.map(row => `<tr>
      <td>${formatDate(row.data)}</td>
      <td><span class="pill">${escapeHtml(row.lote)}</span></td>
      <td><strong>${escapeHtml(row.grupo)}</strong></td>
      <td>${escapeHtml(row.tipo)}</td>
      <td><strong>${nf.format(row.quantidade || 0)}</strong></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}


function renderReleaseTests() {
  const filters = getReleaseFilters();
  const allRows = filterReleaseProduction(state.production, filters);
  const allCycles = computeReleaseCycles(allRows);
  const cycles = filters.status && filters.status !== "todos" ? allCycles.filter(item => item.status === filters.status) : allCycles;
  const visibleKeys = new Set(cycles.map(item => item.key));
  const rows = allRows.filter(row => visibleKeys.has(releaseCycleKey(row)));
  const totalProduction = sum(rows, "quantidade");
  const lotCount = countUnique(rows, row => row.lote);
  const mandatory = cycles.filter(item => item.status === "ensaio").length;
  const near = cycles.filter(item => item.status === "proximo").length;

  renderKpis("releaseKpis", [
    kpi("Produção contada", nf.format(totalProduction), "dormentes nos ciclos filtrados"),
    kpi("Lotes contados", nf.format(lotCount), "lotes únicos"),
    kpi("Projetos", nf.format(countUnique(rows, row => row.projeto)), "projetos no recorte"),
    kpi("Ensaios obrigatórios", nf.format(mandatory), "2.000 peças ou 10 lotes"),
    kpi("Próximos", nf.format(near), "acima de 1.800 peças ou 9 lotes")
  ]);

  renderReleaseCycleCards(cycles.slice(0, 18));
  renderReleasePriorityList(cycles);
  renderReleaseRuleBox();
  renderReleaseLotsTable(cycles);
}

function releaseLotsHtml(item) {
  if (!item.lotRows?.length) return "";
  return `<div class="release-lots">
    <div class="release-lots__head"><span>Lotes da série</span><strong>Último lote: ${escapeHtml(item.ultimoLote || "-")}</strong></div>
    <div class="release-lot-chips">${item.lotRows.map(lot => {
      const isLast = String(lot.lote) === String(item.ultimoLote);
      return `<span class="lot-chip ${isLast ? "lot-chip--latest" : ""}" title="${isLast ? "Último lote da série" : "Lote da série"}">${escapeHtml(lot.lote)}</span>`;
    }).join("")}</div>
  </div>`;
}

function renderReleaseCycleCards(cycles) {
  const target = $("releaseCycleCards");
  if (!target) return;
  if (!cycles.length) {
    target.innerHTML = emptyState("Nenhum ciclo encontrado", "Importe uma planilha ou ajuste os filtros de ensaio de liberação.");
    return;
  }
  target.innerHTML = `<div class="release-grid">${cycles.map(item => `
    <article class="series-card release-card">
      <div class="series-card__top">
        <div>
          <h4>${escapeHtml(item.projeto)} • ${escapeHtml(item.serie)}</h4>
          <p>${escapeHtml(item.aberta ? "Ciclo aberto sem série registrada" : "Série de ensaio registrada na planilha")} • ${escapeHtml(item.bitolaResumo)}</p>
        </div>
        <span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.label)}</span>
      </div>
      <div class="release-meta-grid">
        <div><span>Período</span><strong>${escapeHtml(formatDate(item.primeiraData))} — ${escapeHtml(formatDate(item.ultimaData))}</strong></div>
        <div><span>Gatilho</span><strong>${escapeHtml(item.gatilho)}</strong></div>
        <div><span>Faltam peças</span><strong>${nf.format(item.saldoQuantidade)}</strong></div>
        <div><span>Faltam lotes</span><strong>${nf.format(item.saldoLotes)}</strong></div>
      </div>
      ${releaseLotsHtml(item)}
      <div class="series-progress">
        <div><div class="progress-label"><span>Dormentes por projeto</span><span>${nf.format(item.quantidade)} / ${nf.format(LIMIT_QTY)}</span></div><div class="progress-track"><span style="width:${item.qtyPct}%"></span></div></div>
        <div><div class="progress-label"><span>Lotes por projeto</span><span>${nf.format(item.lotCount)} / ${nf.format(LIMIT_LOTS)}</span></div><div class="progress-track progress-track--yellow"><span style="width:${item.lotPct}%"></span></div></div>
      </div>
    </article>`).join("")}</div>`;
}

function renderReleasePriorityList(cycles) {
  const items = cycles.map(item => ({
    name: `${item.projeto} • ${item.serie}`,
    value: Math.round(item.progress),
    meta: `${nf.format(item.quantidade)} dormentes • ${nf.format(item.lotCount)} lotes • ${item.gatilho}`
  }));
  renderRankList("releasePriorityList", items, {
    limit: 10,
    valueLabel: value => `${nf.format(value)}%`,
    meta: item => item.meta,
    trackClass: "progress-track--yellow"
  });
}

function renderReleaseRuleBox() {
  const target = $("releaseRuleBox");
  if (!target) return;
  target.innerHTML = `<div class="rule-box">
    <div class="rule-step"><strong>1</strong><span>A planilha importada fornece data, lote, projeto, tipo, quantidade e a coluna <b>SÉRIE - ENSAIO DE LIBERAÇÃO</b>.</span></div>
    <div class="rule-step"><strong>2</strong><span>O painel agrupa por <b>projeto + série de ensaio</b>. Cada série é um ciclo independente, ou seja, a contagem reinicia quando uma nova série aparece na planilha.</span></div>
    <div class="rule-step"><strong>3</strong><span>O status vira <b>Ensaio obrigatório</b> quando o ciclo soma ${nf.format(LIMIT_QTY)} dormentes ou ${nf.format(LIMIT_LOTS)} lotes.</span></div>
    <div class="rule-step"><strong>4</strong><span>Quando a coluna de série vem vazia ou zerada, os lotes entram como <b>ciclo aberto</b> até a planilha registrar uma nova realização de ensaio.</span></div>
  </div>`;
}

function renderReleaseLotsTable(cycles) {
  const target = $("releaseLotsTable");
  if (!target) return;
  const rows = cycles.flatMap(cycle => cycle.lotRows.map(lot => ({ cycle, lot }))).slice(0, 260);
  if (!rows.length) {
    target.innerHTML = emptyState("Nenhum lote encontrado", "Importe uma planilha ou ajuste os filtros.");
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Projeto</th><th>Série / ciclo</th><th>Status</th><th>Lote</th><th>Data</th><th>Tipo de dormente</th><th>Qtd. lote</th><th>Acumulado do ciclo</th><th>Lotes ciclo</th></tr></thead>
    <tbody>${rows.map(({ cycle, lot }) => `<tr>
      <td><strong>${escapeHtml(cycle.projeto)}</strong></td>
      <td>${escapeHtml(cycle.serie)}</td>
      <td><span class="status-badge status-${escapeHtml(cycle.status)}">${escapeHtml(cycle.label)}</span></td>
      <td><span class="pill">${escapeHtml(lot.lote)}</span></td>
      <td>${escapeHtml(formatDate(lot.data))}</td>
      <td>${escapeHtml(lot.tipos)}</td>
      <td><strong>${nf.format(lot.quantidade || 0)}</strong></td>
      <td>${nf.format(cycle.quantidade)} / ${nf.format(LIMIT_QTY)}</td>
      <td>${nf.format(cycle.lotCount)} / ${nf.format(LIMIT_LOTS)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderRejections() {
  const filters = getRejectionFilters();
  const rows = filterRejections(state.rejections, filters);
  const prodForRate = filterProduction(state.production, { from: filters.from, to: filters.to, project: filters.project, serie: "todos", search: filters.search });
  const totalProduction = sum(prodForRate, "quantidade");
  const rate = totalProduction ? rows.length / totalProduction * 100 : 0;
  renderKpis("rejectionKpis", [
    kpi("Ocorrências", nf.format(rows.length), "refugos/reprovas filtrados"),
    kpi("Taxa NC", `${pct.format(rate)}%`, "ocorrências / produção"),
    kpi("Lotes com NC", nf.format(countUnique(rows, row => row.lote)), "lotes afetados"),
    kpi("Motivos", nf.format(countUnique(rows, row => row.motivoComum)), "causas agrupadas"),
    kpi("Moldes", nf.format(countUnique(rows, row => row.molde)), "moldes citados")
  ]);

  const weekly = Array.from(rows.reduce((map, row) => {
    const week = isoWeekInfo(row.data);
    const item = map.get(week.sort) || { sort: week.sort, label: week.label, rejections: 0 };
    item.rejections += 1;
    map.set(week.sort, item);
    return map;
  }, new Map()).values()).sort((a, b) => a.sort.localeCompare(b.sort)).slice(-16);
  renderVerticalChart("rejectionWeeklyChart", weekly, [{ field: "rejections", label: "Refugos/Reprovas", className: "vbar--yellow" }]);

  renderRankList("ncByMaterial", groupBy(rows, row => row.tipo || "Tipo não informado"), {
    valueLabel: value => `${nf.format(value)} ocorr.` ,
    trackClass: "progress-track--yellow"
  });
  renderRankList("detailedReasons", groupBy(rows, row => row.motivoDetalhado || row.motivoIndicador || "Sem motivo informado"), {
    valueLabel: value => `${nf.format(value)} ocorr.` ,
    trackClass: "progress-track--yellow"
  });
  const moldCavity = groupBy(rows, row => {
    const mold = row.molde && row.molde !== "-" ? `Molde ${row.molde}` : "Molde não informado";
    const cavity = row.cavidade && row.cavidade !== "-" ? `Cavidade ${row.cavidade}` : "Cavidade não informada";
    return `${mold} • ${cavity}`;
  });
  renderRankList("moldCavityRanking", moldCavity, {
    valueLabel: value => `${nf.format(value)} ocorr.` ,
    trackClass: "progress-track--yellow"
  });
  renderRejectionTable(rows.slice(0, 180));
}

function renderRejectionTable(rows) {
  const target = $("rejectionTable");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = emptyState();
    return;
  }
  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Data</th><th>Lote</th><th>Projeto / Bitola</th><th>Tipo</th><th>Molde</th><th>Cavidade</th><th>Motivo</th><th>Indicador</th></tr></thead>
    <tbody>${rows.map(row => `<tr>
      <td>${formatDate(row.data)}</td>
      <td><span class="pill pill--yellow">${escapeHtml(row.lote)}</span></td>
      <td><strong>${escapeHtml(row.grupo)}</strong></td>
      <td>${escapeHtml(row.tipo)}</td>
      <td>${escapeHtml(row.molde)}</td>
      <td>${escapeHtml(row.cavidade)}</td>
      <td>${escapeHtml(row.motivoDetalhado || "-")}</td>
      <td><strong>${escapeHtml(row.motivoComum)}</strong></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function renderEmptyDashboards() {
  renderKpis("generalKpis", [
    kpi("Produção", "0", "importe a planilha"),
    kpi("Lotes", "0", "importe a planilha"),
    kpi("Refugos / reprovas", "0", "importe a planilha"),
    kpi("Taxa refugo", "0%", "importe a planilha"),
    kpi("Séries em ensaio", "0", "importe a planilha")
  ]);
  renderKpis("productionKpis", [
    kpi("Produção", "0"), kpi("Lotes", "0"), kpi("Projetos / bitolas", "0"), kpi("Tipos de dormente", "0")
  ]);
  renderKpis("releaseKpis", [
    kpi("Produção contada", "0"), kpi("Lotes contados", "0"), kpi("Projetos", "0"), kpi("Ensaios obrigatórios", "0"), kpi("Próximos", "0")
  ]);
  renderKpis("rejectionKpis", [
    kpi("Ocorrências", "0"), kpi("Taxa NC", "0%"), kpi("Lotes com NC", "0"), kpi("Motivos", "0"), kpi("Moldes", "0")
  ]);
  ["weeklyQualityChart", "productionByProject", "rejectionByReason", "criticalLots", "qualityInsights", "productionBalance", "productionWeeklyChart", "productionTable", "weeklyProductionReport", "releaseCycleCards", "releasePriorityList", "releaseRuleBox", "releaseLotsTable", "rejectionWeeklyChart", "ncByMaterial", "detailedReasons", "moldCavityRanking", "rejectionTable"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = emptyState("Painel zerado", "Importe uma planilha para visualizar os dados.");
  });
}

function render() {
  renderHeaderStats();
  if (!state.production.length && !state.rejections.length) {
    renderEmptyDashboards();
    return;
  }
  renderGeneral();
  renderProduction();
  renderReleaseTests();
  renderRejections();
}

function switchTab(tabId) {
  state.activeTab = tabId;
  $$(".tab-button").forEach(button => button.classList.toggle("active", button.dataset.tab === tabId));
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
}

function setupEvents() {
  $$(".tab-button").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("chooseFileBtn")?.addEventListener("click", () => $("fileInput")?.click());
  $("fileInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = $("importStatus");
    try {
      if (status) status.textContent = `Lendo ${file.name}...`;
      await parseWorkbookFile(file);
    } catch (error) {
      console.error(error);
      if (status) status.textContent = `Erro: ${error.message}`;
      alert(`Não consegui ler a planilha: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
  $("clearDataBtn")?.addEventListener("click", clearData);

  const dropZone = $("dropZone");
  if (dropZone) {
    ["dragenter", "dragover"].forEach(eventName => dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
    }));
    ["dragleave", "drop"].forEach(eventName => dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragover");
    }));
    dropZone.addEventListener("drop", async (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const status = $("importStatus");
      try {
        if (status) status.textContent = `Lendo ${file.name}...`;
        await parseWorkbookFile(file);
      } catch (error) {
        console.error(error);
        if (status) status.textContent = `Erro: ${error.message}`;
        alert(`Não consegui ler a planilha: ${error.message}`);
      }
    });
  }

  [
    "dashDateFrom", "dashDateTo", "dashProjectFilter", "dashSearch",
    "prodDateFrom", "prodDateTo", "prodProjectFilter", "prodSearch",
    "relDateFrom", "relDateTo", "relProjectFilter", "relBitolaFilter", "relStatusFilter", "relSearch",
    "rejDateFrom", "rejDateTo", "rejProjectFilter", "rejReasonFilter", "rejLotFilter", "rejSearch"
  ].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", render);
  });
}

setupEvents();
populateFilters();
render();
