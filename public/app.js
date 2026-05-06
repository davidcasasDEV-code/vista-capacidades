const state = {
  config: null,
  initiatives: [],
  views: [],
  activeViewId: null,
  activeView: null,
  selectedColumns: [],
  filters: {},
  fieldSettings: {},
  fieldSettingsDirty: false,
  fieldSettingsSearch: "",
  lastDataUpdated: "",
  columnFilters: {},
  columnSearch: "",
  viewSearch: "",
  draggedColumnKey: null,
  pendingChanges: {},
  configDirty: false,
  currentPage: 1,
  pageSize: 20,
  activeTextModal: null,
  openFilterKey: null
};

const els = {
  totalItems: document.querySelector("#totalItems"),
  sreChart: document.querySelector("#sreChart"),
  championChart: document.querySelector("#championChart"),
  initiativeDonut: document.querySelector("#initiativeDonut"),
  initiativeLegend: document.querySelector("#initiativeLegend"),
  mvpDonut: document.querySelector("#mvpDonut"),
  mvpLegend: document.querySelector("#mvpLegend"),
  viewsList: document.querySelector("#viewsList"),
  viewsSearch: document.querySelector("#viewsSearch"),
  workspaceShell: document.querySelector(".workspace-shell"),
  dataTable: document.querySelector("#dataTable"),
  viewName: document.querySelector("#viewName"),
  saveState: document.querySelector("#saveState"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingProgressBar: document.querySelector("#loadingProgressBar"),
  loadingPercent: document.querySelector("#loadingPercent"),
  refreshButton: document.querySelector("#refreshButton"),
  exportButton: document.querySelector("#exportButton"),
  saveViewButton: document.querySelector("#saveViewButton"),
  deleteViewButton: document.querySelector("#deleteViewButton"),
  newViewButton: document.querySelector("#newViewButton"),
  toggleViewsButton: document.querySelector("#toggleViewsButton"),
  columnsButton: document.querySelector("#columnsButton"),
  columnsPopover: document.querySelector("#columnsPopover"),
  closeColumnsButton: document.querySelector("#closeColumnsButton"),
  columnsSearch: document.querySelector("#columnsSearch"),
  columnsChecklist: document.querySelector("#columnsChecklist"),
  fieldSettingsButton: document.querySelector("#fieldSettingsButton"),
  fieldSettingsModal: document.querySelector("#fieldSettingsModal"),
  closeFieldSettingsModal: document.querySelector("#closeFieldSettingsModal"),
  fieldSettingsSearch: document.querySelector("#fieldSettingsSearch"),
  fieldSettingsList: document.querySelector("#fieldSettingsList"),
  saveFieldSettingsButton: document.querySelector("#saveFieldSettingsButton"),
  topFilterSre: document.querySelector("#topFilterSre"),
  topFilterChampion: document.querySelector("#topFilterChampion"),
  topFilterMvpStatus: document.querySelector("#topFilterMvpStatus"),
  clearSavedFilters: document.querySelector("#clearSavedFilters"),
  topPagination: document.querySelector("#topPagination"),
  bottomPagination: document.querySelector("#bottomPagination"),
  topScroll: document.querySelector("#topScroll"),
  topScrollContent: document.querySelector("#topScrollContent"),
  sheetWrapper: document.querySelector("#sheetWrapper"),
  chartModal: document.querySelector("#chartModal"),
  chartModalTitle: document.querySelector("#chartModalTitle"),
  chartModalBody: document.querySelector("#chartModalBody"),
  closeChartModal: document.querySelector("#closeChartModal"),
  chartTooltip: document.querySelector("#chartTooltip"),
  textModal: document.querySelector("#textModal"),
  textModalTitle: document.querySelector("#textModalTitle"),
  textModalMeta: document.querySelector("#textModalMeta"),
  textModalValue: document.querySelector("#textModalValue"),
  closeTextModal: document.querySelector("#closeTextModal"),
  saveTextModal: document.querySelector("#saveTextModal"),
  openCommentComposer: document.querySelector("#openCommentComposer"),
  commentComposer: document.querySelector("#commentComposer"),
  commentTarget: document.querySelector("#commentTarget"),
  newCommentValue: document.querySelector("#newCommentValue"),
  stageCommentButton: document.querySelector("#stageCommentButton")
};

const colors = ["#0f6b5f", "#c58a21", "#33658a", "#7b4f9d", "#b64b3c", "#4e7f45"];
const savedFilterFields = [
  { key: "mvp:SRE asignado", label: "SRE asignado" },
  { key: "mvp:Champions", label: "Champions" },
  { key: "mvp:Estado", label: "Estatus de MVP" }
];

const legacySavedFilterKeys = {
  "mvp:Estado del MVP": "mvp:Estado"
};

const commentFieldKeys = {
  mvp: "top:ultimo_comentario_mvp",
  iniciativa: "top:ultimo_comentario_iniciativa"
};

const readOnlyTextFields = new Set([
  "top:ultimo_comentario_mvp",
  "top:ultimo_comentario_mvp.comentario",
  "top:ultimo_comentario_iniciativa",
  "top:iniciativa_padre.ultimo_comentario_iniciativa",
  "iniciativa:Comentario"
]);

function api(path, options = {}) {
  return fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Ocurrio un error en la peticion.");
    }
    const payload = await response.json();
    return typeof payload === "string" ? JSON.parse(payload) : payload;
  });
}

function getColumn(key) {
  return state.config.columns.find((column) => column.key === key);
}

function getPrimaryKey(item) {
  return item[state.config.primaryKey];
}

function getPathValue(item, path) {
  return path.reduce((value, segment) => {
    if (value === null || value === undefined) return undefined;
    return value[segment];
  }, item);
}

function isFieldEnvelope(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("valor" in value || "tipo_dato" in value || "opciones" in value)
  );
}

function unwrapFieldValue(value) {
  return isFieldEnvelope(value) ? value.valor : value;
}

function getFieldMeta(item, column) {
  if (!column?.metaPath) return null;
  const meta = getPathValue(item, column.metaPath);
  return isFieldEnvelope(meta) ? meta : null;
}

function getValue(item, column) {
  if (!column?.path) return item[column?.key];
  return unwrapFieldValue(getPathValue(item, column.path));
}

function getLinkValue(item, column) {
  const paths = [...(column.linkPaths || []), column.linkPath].filter(Boolean);
  const seen = new Set();

  for (const path of paths) {
    const key = path.join(".");
    if (seen.has(key)) continue;
    seen.add(key);
    const value = formatValue(getPathValue(item, path));
    if (value) return value;
  }

  return "";
}

function setPathValue(item, path, value) {
  let cursor = item;
  path.slice(0, -1).forEach((segment) => {
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
  cursor[path[path.length - 1]] = value;
}

function setValue(item, column, value) {
  const meta = getFieldMeta(item, column);
  if (meta) {
    meta.valor = value;
    return;
  }
  setPathValue(item, column.path, value);
}

function hasPendingChanges() {
  return state.configDirty || Object.keys(state.pendingChanges).length > 0;
}

function hasAnyPendingChanges() {
  return hasPendingChanges() || state.fieldSettingsDirty;
}

function markConfigDirty(message = "Configuración pendiente de guardar.") {
  state.configDirty = true;
  setSaveState(message);
}

function markFieldSettingsDirty(message = "Configuracion global de campos pendiente de guardar.") {
  state.fieldSettingsDirty = true;
  setSaveState(message);
}

function clearDraftState() {
  state.pendingChanges = {};
  state.configDirty = false;
}

function isCellPending(rowKey, field) {
  return Object.prototype.hasOwnProperty.call(state.pendingChanges[rowKey] || {}, field);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getSavedFilterFields() {
  return savedFilterFields.map((filter) => filter.key);
}

function normalizeFilterValues(value) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function sanitizeSavedFilters(filters = {}) {
  const allowed = new Set(getSavedFilterFields());
  return Object.entries(filters).reduce((acc, [field, value]) => {
    const normalizedField = legacySavedFilterKeys[field] || field;
    const values = normalizeFilterValues(value);
    if (allowed.has(normalizedField) && values.length) acc[normalizedField] = values;
    return acc;
  }, {});
}

function sanitizeFieldSettings(settings = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const known = new Set((state.config?.columns || []).map((column) => column.key));

  return Object.entries(settings).reduce((acc, [key, value]) => {
    const keyLooksKnown = known.has(key) || key.startsWith("mvp:") || key.startsWith("iniciativa:");
    if (!keyLooksKnown || !value || typeof value !== "object" || Array.isArray(value)) return acc;
    const normalized = {};
    if (typeof value.hidden === "boolean") normalized.hidden = value.hidden;
    if (typeof value.readonly === "boolean") normalized.readonly = value.readonly;
    if (Object.keys(normalized).length) acc[key] = normalized;
    return acc;
  }, {});
}

function getFieldSetting(key) {
  return state.fieldSettings[key] || {};
}

function isColumnHiddenFromSelector(column) {
  return Boolean(column.hidden || getFieldSetting(column.key).hidden);
}

function isColumnReadonlyBySettings(column) {
  return Boolean(getFieldSetting(column.key).readonly);
}

function getAvailableColumns() {
  return state.config.columns.filter((column) => !isColumnHiddenFromSelector(column));
}

function syncSelectedColumns() {
  const available = new Set(getAvailableColumns().map((column) => column.key));
  const known = new Set((state.config?.columns || []).map((column) => column.key));
  state.selectedColumns = state.selectedColumns.filter((key) => {
    if (getFieldSetting(key).hidden) return false;
    return available.has(key) || !known.has(key);
  });
  if (!state.selectedColumns.length) {
    const first = getAvailableColumns()[0];
    if (first) state.selectedColumns = [first.key];
  }
}

function updateFieldSetting(key, patch) {
  const current = state.fieldSettings[key] || {};
  const next = { ...current, ...patch };
  Object.keys(next).forEach((prop) => {
    if (next[prop] === false || next[prop] === undefined || next[prop] === null) delete next[prop];
  });

  if (Object.keys(next).length) {
    state.fieldSettings[key] = next;
  } else {
    delete state.fieldSettings[key];
  }

  syncSelectedColumns();
  renderColumnsChecklist();
  renderFieldSettingsList();
  renderTable();
  markFieldSettingsDirty();
}

function matchesSavedFilter(item, field, expected) {
  const column = getColumn(field);
  if (!column) return true;
  const selected = normalizeFilterValues(expected).map(normalizeText);
  if (!selected.length) return true;
  return splitMultipleValues(getValue(item, column)).some((value) => selected.includes(normalizeText(value)));
}

function matchesColumnFilter(item, field, expected) {
  const filter = normalizeText(expected);
  if (!filter) return true;
  const column = getColumn(field);
  if (!column) return true;
  return normalizeText(formatValue(getValue(item, column))).includes(filter);
}

function getVisibleRows() {
  return state.initiatives.filter((item) => {
    const savedFiltersMatch = Object.entries(state.filters)
      .every(([field, expected]) => matchesSavedFilter(item, field, expected));
    const columnFiltersMatch = Object.entries(state.columnFilters)
      .every(([field, expected]) => matchesColumnFilter(item, field, expected));
    return savedFiltersMatch && columnFiltersMatch;
  });
}

function formatValue(value) {
  if (isFieldEnvelope(value)) return formatValue(value.valor);

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === "object") {
        return entry.name || entry.title || JSON.stringify(entry);
      }
      return entry;
    }).join(" | ");
  }

  if (value && typeof value === "object") {
    return value.name || value.title || JSON.stringify(value);
  }

  return String(value ?? "");
}

function splitMultipleValues(value) {
  if (Array.isArray(value)) {
    return value.map(formatValue).map((entry) => entry.trim()).filter(Boolean);
  }

  return formatValue(value).split("|").map((entry) => entry.trim()).filter(Boolean);
}

function countBy(items, field) {
  const column = getColumn(field);
  return items.reduce((acc, item) => {
    const values = splitMultipleValues(getValue(item, column));
    const keys = values.length ? values : ["Sin dato"];
    keys.forEach((key) => {
      acc[key] = (acc[key] || 0) + 1;
    });
    return acc;
  }, {});
}

function resetPagination() {
  state.currentPage = 1;
}

function getPaginationState() {
  const rows = getVisibleRows();
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.currentPage = Math.min(Math.max(1, state.currentPage), totalPages);
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, totalRows);

  return {
    rows,
    totalRows,
    totalPages,
    startIndex,
    endIndex,
    pageRows: rows.slice(startIndex, endIndex)
  };
}

function renderPaginationControls(target, pagination) {
  if (!target) return;
  target.innerHTML = "";

  const info = document.createElement("span");
  info.className = "pagination-info";
  const start = pagination.totalRows ? pagination.startIndex + 1 : 0;
  info.textContent = `${start}-${pagination.endIndex} de ${pagination.totalRows}`;

  const pageInfo = document.createElement("span");
  pageInfo.className = "pagination-page";
  pageInfo.textContent = `Pagina ${state.currentPage} de ${pagination.totalPages}`;

  const buttons = [
    ["first", "Primera", "<<", state.currentPage <= 1],
    ["prev", "Anterior", "<", state.currentPage <= 1],
    ["next", "Siguiente", ">", state.currentPage >= pagination.totalPages],
    ["last", "Ultima", ">>", state.currentPage >= pagination.totalPages]
  ];

  buttons.forEach(([action, title, label, disabled], index) => {
    if (index === 2) target.append(info, pageInfo);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button pagination-button";
    button.title = title;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      if (action === "first") state.currentPage = 1;
      if (action === "prev") state.currentPage -= 1;
      if (action === "next") state.currentPage += 1;
      if (action === "last") state.currentPage = pagination.totalPages;
      renderTableBody();
    });
    target.append(button);
  });
}

function updateTopScrollWidth() {
  window.requestAnimationFrame(() => {
    if (!els.topScrollContent || !els.dataTable) return;
    els.topScrollContent.style.width = `${els.dataTable.scrollWidth}px`;
  });
}

function renderPagination(pagination) {
  renderPaginationControls(els.topPagination, pagination);
  renderPaginationControls(els.bottomPagination, pagination);
  updateTopScrollWidth();
}

function positionChartTooltip(event) {
  if (!els.chartTooltip) return;
  const margin = 14;
  const rect = els.chartTooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - margin, event.clientX + margin);
  const top = Math.min(window.innerHeight - rect.height - margin, event.clientY + margin);
  els.chartTooltip.style.left = `${Math.max(margin, left)}px`;
  els.chartTooltip.style.top = `${Math.max(margin, top)}px`;
}

function showChartTooltip(text, event) {
  if (!els.chartTooltip) return;
  els.chartTooltip.textContent = text;
  els.chartTooltip.classList.remove("hidden");
  positionChartTooltip(event);
}

function hideChartTooltip() {
  els.chartTooltip?.classList.add("hidden");
}

function attachChartTooltip(node, label, value) {
  const text = `${label}: ${value}`;
  node.setAttribute("data-tooltip", text);
  node.addEventListener("mouseenter", (event) => showChartTooltip(text, event));
  node.addEventListener("mousemove", positionChartTooltip);
  node.addEventListener("mouseleave", hideChartTooltip);
}

function getSortedEntries(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function collapseCounts(counts, limit = 6) {
  const entries = getSortedEntries(counts);
  if (entries.length <= limit) return counts;
  const visible = entries.slice(0, Math.max(1, limit - 1));
  const otherTotal = entries.slice(Math.max(1, limit - 1)).reduce((sum, [, value]) => sum + value, 0);
  return Object.fromEntries([...visible, ["Otros", otherTotal]]);
}

function renderBarChart(target, counts, limit = 5) {
  const entries = getSortedEntries(counts).slice(0, limit);
  const max = Math.max(1, ...entries.map(([, value]) => value));

  target.innerHTML = "";
  entries.forEach(([label, value], index) => {
    const row = document.querySelector("#barTemplate").content.firstElementChild.cloneNode(true);
    attachChartTooltip(row, label, value);
    row.querySelector(".bar-label").textContent = label;
    row.querySelector(".bar-fill").style.width = `${(value / max) * 100}%`;
    row.querySelector(".bar-fill").style.background = colors[index % colors.length];
    row.querySelector(".bar-value").textContent = value;
    target.append(row);
  });
}

function renderLargeBarChart(target, counts) {
  target.innerHTML = "";
  const chart = document.createElement("div");
  chart.className = "bar-chart large";
  target.append(chart);
  renderBarChart(chart, counts, 24);
}

function renderDonutChart(targetDonut, targetLegend, counts, options = {}) {
  const displayCounts = options.limit ? collapseCounts(counts, options.limit) : counts;
  const entries = getSortedEntries(displayCounts);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  targetDonut.innerHTML = "";
  targetDonut.title = entries.map(([label, value]) => `${label}: ${value}`).join("\n");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("role", "img");

  const base = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  base.setAttribute("cx", "50");
  base.setAttribute("cy", "50");
  base.setAttribute("r", String(radius));
  base.setAttribute("fill", "none");
  base.setAttribute("stroke", "#d9e2ee");
  base.setAttribute("stroke-width", "18");
  svg.append(base);

  entries.forEach(([label, value], index) => {
    const length = (value / total) * circumference;
    const segment = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    segment.setAttribute("cx", "50");
    segment.setAttribute("cy", "50");
    segment.setAttribute("r", String(radius));
    segment.setAttribute("fill", "none");
    segment.setAttribute("stroke", colors[index % colors.length]);
    segment.setAttribute("stroke-width", "18");
    segment.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
    segment.setAttribute("stroke-dashoffset", String(-offset));
    segment.setAttribute("transform", "rotate(-90 50 50)");
    segment.setAttribute("class", "donut-segment");
    attachChartTooltip(segment, label, value);
    svg.append(segment);
    offset += length;
  });

  targetDonut.append(svg);
  targetLegend.innerHTML = "";
  entries.forEach(([label, value], index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    attachChartTooltip(item, label, value);
    item.innerHTML = `<span class="legend-swatch" style="background:${colors[index % colors.length]}"></span><span>${label}</span><strong>${value}</strong>`;
    targetLegend.append(item);
  });
}

function renderMetrics() {
  const rows = getVisibleRows();
  const metrics = state.config.metricFields || {};
  state.metricCounts = {
    sre: countBy(rows, metrics.sre),
    champion: countBy(rows, metrics.champion),
    mvpStatus: countBy(rows, metrics.mvpStatus),
    initiativeStatus: countBy(rows, metrics.initiativeStatus)
  };
  els.totalItems.textContent = rows.length;
  renderBarChart(els.sreChart, state.metricCounts.sre);
  renderBarChart(els.championChart, state.metricCounts.champion);
  renderDonutChart(els.mvpDonut, els.mvpLegend, state.metricCounts.mvpStatus, { limit: 6 });
  renderDonutChart(els.initiativeDonut, els.initiativeLegend, state.metricCounts.initiativeStatus, { limit: 6 });
}

function openChartModal(chartKey) {
  const titles = {
    sre: "SRE",
    champion: "Champions",
    mvpStatus: "Estatus MVP",
    initiativeStatus: "Estatus Iniciativa"
  };
  const counts = state.metricCounts?.[chartKey] || {};
  els.chartModalTitle.textContent = titles[chartKey] || "Gráfica";
  els.chartModalBody.innerHTML = "";

  if (chartKey === "mvpStatus" || chartKey === "initiativeStatus") {
    const wrap = document.createElement("div");
    wrap.className = "donut-wrap modal-donut-wrap";
    const donut = document.createElement("div");
    donut.className = "donut modal-donut";
    const legend = document.createElement("div");
    legend.className = "legend modal-legend";
    wrap.append(donut, legend);
    els.chartModalBody.append(wrap);
    renderDonutChart(donut, legend, counts);
  } else {
    renderLargeBarChart(els.chartModalBody, counts);
  }

  els.chartModal.classList.remove("hidden");
}

function closeChartModal() {
  els.chartModal.classList.add("hidden");
  els.chartModalBody.innerHTML = "";
}

function renderViews() {
  els.viewsList.innerHTML = "";
  const query = state.viewSearch.trim().toLowerCase();
  const matchingViews = state.views.filter((view) => {
    if (!query) return true;
    return `${view.name} ${view.id}`.toLowerCase().includes(query);
  });

  if (!matchingViews.length) {
    const empty = document.createElement("div");
    empty.className = "empty-columns";
    empty.textContent = "No hay vistas que coincidan.";
    els.viewsList.append(empty);
    return;
  }

  matchingViews.forEach((view) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `view-item${view.id === state.activeViewId ? " active" : ""}`;
    button.innerHTML = `<strong>${view.name}</strong><span>${view.columns.length} columnas</span>`;
    button.addEventListener("click", () => requestActivateView(view.id));
    els.viewsList.append(button);
  });
}

function getFilterValues(field) {
  const column = getColumn(field);
  if (!column) return [];
  const values = new Set();
  state.initiatives.forEach((item) => {
    const entries = splitMultipleValues(getValue(item, column));
    entries.forEach((entry) => {
      if (entry) values.add(entry);
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, "es"));
}

function createFilterTag(label, index, removable = false, onRemove = null) {
  const tag = document.createElement(removable ? "button" : "span");
  tag.className = "filter-tag";
  tag.style.setProperty("--tag-color", colors[index % colors.length]);
  tag.textContent = label;
  tag.title = label;
  if (removable) {
    tag.type = "button";
    tag.title = `Quitar ${label}`;
    tag.addEventListener("click", (event) => {
      event.stopPropagation();
      onRemove?.();
    });
  }
  return tag;
}

function renderSavedFilter(container, filter) {
  if (!container) return;
  const selectedValues = normalizeFilterValues(state.filters[filter.key]);
  const values = getFilterValues(filter.key);
  selectedValues.forEach((selectedValue) => {
    if (!values.includes(selectedValue)) values.unshift(selectedValue);
  });

  container.innerHTML = "";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "multi-filter-trigger";
  trigger.setAttribute("aria-label", filter.label);

  const tags = document.createElement("div");
  tags.className = "filter-tags";
  if (selectedValues.length) {
    selectedValues.slice(0, 3).forEach((value, index) => {
      tags.append(createFilterTag(value, index, true, () => {
        updateSavedFilter(filter.key, selectedValues.filter((entry) => entry !== value), true);
      }));
    });
    if (selectedValues.length > 3) {
      tags.append(createFilterTag(`+${selectedValues.length - 3}`, 3));
    }
  } else {
    tags.append(createFilterTag("Todos", 0));
  }

  const caret = document.createElement("span");
  caret.className = "multi-filter-caret";
  caret.textContent = "v";
  trigger.append(tags, caret);

  const menu = document.createElement("div");
  menu.className = `multi-filter-menu${state.openFilterKey === filter.key ? "" : " hidden"}`;

  const allOption = document.createElement("label");
  allOption.className = `multi-filter-option${selectedValues.length ? "" : " is-selected"}`;
  const allCheckbox = document.createElement("input");
  allCheckbox.type = "checkbox";
  allCheckbox.checked = !selectedValues.length;
  allCheckbox.addEventListener("change", () => updateSavedFilter(filter.key, [], true));
  allOption.append(allCheckbox, createFilterTag("Todos", 0));
  menu.append(allOption);

  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "multi-filter-empty";
    empty.textContent = "Sin valores disponibles";
    menu.append(empty);
  } else {
    values.forEach((value, index) => {
      const option = document.createElement("label");
      option.className = `multi-filter-option${selectedValues.includes(value) ? " is-selected" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = value;
      checkbox.checked = selectedValues.includes(value);
      checkbox.addEventListener("change", () => {
        const nextValues = checkbox.checked
          ? Array.from(new Set([...selectedValues, value]))
          : selectedValues.filter((entry) => entry !== value);
        updateSavedFilter(filter.key, nextValues, true);
      });
      option.append(checkbox, createFilterTag(value, index + 1));
      menu.append(option);
    });
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll(".multi-filter-menu").forEach((node) => {
      if (node !== menu) node.classList.add("hidden");
    });
    state.openFilterKey = menu.classList.contains("hidden") ? filter.key : null;
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", (event) => event.stopPropagation());
  container.append(trigger, menu);
}

function renderSavedFilters() {
  renderSavedFilter(els.topFilterSre, savedFilterFields[0]);
  renderSavedFilter(els.topFilterChampion, savedFilterFields[1]);
  renderSavedFilter(els.topFilterMvpStatus, savedFilterFields[2]);
}

function renderColumnsChecklist() {
  els.columnsChecklist.innerHTML = "";
  const query = state.columnSearch.trim().toLowerCase();
  const matchingColumns = getAvailableColumns().filter((column) => {
    if (!query) return true;
    return `${column.label} ${column.key}`.toLowerCase().includes(query);
  });

  if (!matchingColumns.length) {
    const empty = document.createElement("div");
    empty.className = "empty-columns";
    empty.textContent = "No hay columnas que coincidan.";
    els.columnsChecklist.append(empty);
    return;
  }

  matchingColumns.forEach((column) => {
    const id = `column-${column.key}`;
    const label = document.createElement("label");
    label.className = "column-option";
    const checkbox = document.createElement("input");
    checkbox.id = id;
    checkbox.type = "checkbox";
    checkbox.value = column.key;
    const text = document.createElement("span");
    text.textContent = column.label;
    label.append(checkbox, text);
    checkbox.checked = state.selectedColumns.includes(column.key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedColumns = [...state.selectedColumns, column.key];
      } else {
        state.selectedColumns = state.selectedColumns.filter((key) => key !== column.key);
      }
      if (!state.selectedColumns.length) {
        checkbox.checked = true;
        state.selectedColumns = [column.key];
      }
      renderTable();
      markConfigDirty();
    });
    els.columnsChecklist.append(label);
  });
}

function renderFieldSettingsList() {
  if (!els.fieldSettingsList) return;
  els.fieldSettingsList.innerHTML = "";
  const query = state.fieldSettingsSearch.trim().toLowerCase();
  const columns = state.config.columns.filter((column) => {
    if (!query) return true;
    return `${column.label} ${column.key}`.toLowerCase().includes(query);
  });

  if (!columns.length) {
    const empty = document.createElement("div");
    empty.className = "empty-columns";
    empty.textContent = "No hay campos que coincidan.";
    els.fieldSettingsList.append(empty);
    return;
  }

  columns.forEach((column) => {
    const setting = getFieldSetting(column.key);
    const baseReadonly = Boolean(column.readonly || state.config.readonlyFields.includes(column.key));
    const row = document.createElement("div");
    row.className = "field-setting-row";

    const info = document.createElement("div");
    info.className = "field-setting-info";
    const name = document.createElement("strong");
    name.textContent = column.label;
    const meta = document.createElement("span");
    meta.textContent = [column.key, column.dataType || column.type, column.fieldId].filter(Boolean).join(" · ");
    info.append(name, meta);

    const visibleLabel = document.createElement("label");
    visibleLabel.className = "field-setting-toggle";
    const visible = document.createElement("input");
    visible.type = "checkbox";
    visible.checked = !setting.hidden;
    visible.addEventListener("change", () => updateFieldSetting(column.key, { hidden: !visible.checked }));
    visibleLabel.append(visible, document.createTextNode("En selector"));

    const readonlyLabel = document.createElement("label");
    readonlyLabel.className = "field-setting-toggle";
    const readonly = document.createElement("input");
    readonly.type = "checkbox";
    readonly.checked = baseReadonly || Boolean(setting.readonly);
    readonly.disabled = baseReadonly;
    readonly.addEventListener("change", () => updateFieldSetting(column.key, { readonly: readonly.checked }));
    readonlyLabel.append(readonly, document.createTextNode("Solo lectura"));

    row.append(info, visibleLabel, readonlyLabel);
    els.fieldSettingsList.append(row);
  });
}

function openFieldSettingsModal() {
  state.fieldSettingsSearch = "";
  if (els.fieldSettingsSearch) els.fieldSettingsSearch.value = "";
  renderFieldSettingsList();
  els.fieldSettingsModal?.classList.remove("hidden");
  els.fieldSettingsSearch?.focus();
}

function closeFieldSettingsModal() {
  els.fieldSettingsModal?.classList.add("hidden");
}

function moveSelectedColumn(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return false;

  const columns = [...state.selectedColumns];
  const sourceIndex = columns.indexOf(sourceKey);
  const targetIndex = columns.indexOf(targetKey);
  if (sourceIndex === -1 || targetIndex === -1) return false;

  const [source] = columns.splice(sourceIndex, 1);
  columns.splice(targetIndex, 0, source);
  state.selectedColumns = columns;
  return true;
}

function renderTable() {
  const columns = state.selectedColumns.map(getColumn).filter(Boolean);
  const rows = getVisibleRows();

  const headerRow = document.createElement("tr");
  const filterRow = document.createElement("tr");

  columns.forEach((column) => {
    const th = document.createElement("th");
    th.style.width = `${column.width || 160}px`;
    th.draggable = true;
    th.dataset.columnKey = column.key;
    th.title = "Arrastra para reordenar columnas";
    th.addEventListener("dragstart", (event) => {
      state.draggedColumnKey = column.key;
      th.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", column.key);
    });
    th.addEventListener("dragend", () => {
      state.draggedColumnKey = null;
      th.classList.remove("dragging");
      document.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
    });
    th.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (state.draggedColumnKey && state.draggedColumnKey !== column.key) {
        th.classList.add("drop-target");
      }
    });
    th.addEventListener("dragleave", () => {
      th.classList.remove("drop-target");
    });
    th.addEventListener("drop", (event) => {
      event.preventDefault();
      th.classList.remove("drop-target");
      const sourceKey = event.dataTransfer.getData("text/plain") || state.draggedColumnKey;
      if (moveSelectedColumn(sourceKey, column.key)) {
        renderTable();
        renderColumnsChecklist();
        markConfigDirty("Orden de columnas pendiente de guardar.");
      }
    });
    const header = document.createElement("div");
    header.className = "cell-header";
    const title = document.createElement("span");
    title.textContent = column.label;
    header.append(title);
    if (isDisplayReadonlyColumn(column)) {
      const mark = document.createElement("span");
      mark.className = "readonly-mark";
      mark.textContent = "Solo lectura";
      header.append(mark);
    }
    th.append(header);
    headerRow.append(th);

    const filterTh = document.createElement("th");
    const input = document.createElement("input");
    input.className = "filter-input";
    input.placeholder = "Filtrar";
    input.value = state.columnFilters[column.key] || "";
    input.addEventListener("input", () => {
      state.columnFilters[column.key] = input.value;
      if (!input.value.trim()) delete state.columnFilters[column.key];
      resetPagination();
      renderMetrics();
      renderTableBody();
      setSaveState("Filtro rapido aplicado.");
    });
    filterTh.append(input);
    filterRow.append(filterTh);
  });

  const thead = document.createElement("thead");
  thead.append(headerRow, filterRow);
  els.dataTable.replaceChildren(thead, document.createElement("tbody"));
  renderTableBody();
}

function isDisplayReadonlyColumn(column) {
  return state.config.readonlyFields.includes(column.key) ||
    column.readonly ||
    isColumnReadonlyBySettings(column) ||
    readOnlyTextFields.has(column.key);
}

function isCommentColumn(column) {
  return readOnlyTextFields.has(column.key);
}

function isLongTextColumn(column, value) {
  if (column.type && column.type !== "text") return false;
  const key = column.key.toLowerCase();
  const label = column.label.toLowerCase();
  return (
    isCommentColumn(column) ||
    formatValue(value).length > 80 ||
    key.includes("comentario") ||
    label.includes("comentario") ||
    key.includes("descripción") ||
    label.includes("descripción") ||
    key.includes("observaciones") ||
    label.includes("observaciones") ||
    key.includes("impedimentos") ||
    label.includes("impedimentos")
  );
}

function createTextPreview(item, column, readonly, value, pending) {
  const isComment = isCommentColumn(column);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cell-value text-preview${readonly ? " cell-readonly" : ""}${pending ? " cell-pending" : ""}`;
  button.textContent = isComment ? (value ? "Clic para ver mas" : "Sin comentario") : (value || "Sin dato");
  button.title = value || "Abrir detalle";
  button.addEventListener("click", () => openTextModal(item, column));
  return button;
}

function getCellOptions(item, column, currentValues = []) {
  const meta = getFieldMeta(item, column);
  const options = [
    ...(Array.isArray(meta?.opciones) ? meta.opciones : []),
    ...(Array.isArray(column.options) ? column.options : []),
    ...currentValues
  ];

  return Array.from(new Set(
    options
      .map((option) => formatValue(option).trim())
      .filter(Boolean)
  ));
}

function renderChoiceLabel(values, placeholder = "Sin dato") {
  const selected = normalizeFilterValues(values);
  if (!selected.length) return placeholder;
  if (selected.length === 1) return selected[0];
  return `${selected.slice(0, 2).join(" | ")}${selected.length > 2 ? ` +${selected.length - 2}` : ""}`;
}

function createChoiceCell(item, column, values, options, multiple, readonly, pending) {
  const normalizedValues = normalizeFilterValues(values);
  const wrapper = document.createElement("div");
  wrapper.className = `cell-choice${readonly ? " cell-readonly" : ""}${pending ? " cell-pending" : ""}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "cell-choice-trigger";
  trigger.disabled = readonly;
  trigger.title = readonly ? "Solo lectura" : "Seleccionar valor";

  const text = document.createElement("span");
  text.className = `cell-choice-text${normalizedValues.length ? "" : " empty"}`;
  text.textContent = renderChoiceLabel(normalizedValues);

  const caret = document.createElement("span");
  caret.className = "cell-choice-caret";
  caret.textContent = "v";
  trigger.append(text, caret);
  wrapper.append(trigger);

  if (readonly) return wrapper;

  const menu = document.createElement("div");
  menu.className = "cell-choice-menu hidden";

  const allOptions = multiple
    ? options
    : ["", ...options];

  allOptions.forEach((optionValue) => {
    const option = document.createElement("button");
    option.type = "button";
    const selected = multiple
      ? normalizedValues.includes(optionValue)
      : normalizedValues[0] === optionValue || (!normalizedValues.length && optionValue === "");
    option.className = `cell-choice-option${multiple ? " has-check" : ""}${selected ? " is-selected" : ""}`;

    if (multiple) {
      const box = document.createElement("span");
      box.className = "choice-check";
      box.textContent = selected ? "✓" : "";
      option.append(box);
    }

    const label = document.createElement("span");
    label.textContent = optionValue || "Sin dato";
    option.append(label);

    option.addEventListener("click", (event) => {
      event.stopPropagation();
      if (multiple) {
        const nextValues = selected
          ? normalizedValues.filter((entry) => entry !== optionValue)
          : [...normalizedValues, optionValue];
        saveCell(item, column.key, nextValues.join(" | "));
      } else {
        saveCell(item, column.key, optionValue);
      }
    });
    menu.append(option);
  });

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll(".cell-choice-menu").forEach((node) => {
      if (node !== menu) node.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  wrapper.append(menu);
  return wrapper;
}

function getChangePayload(item, column, value) {
  const meta = getFieldMeta(item, column);
  return {
    valor: value,
    id: meta?.id || column.fieldId || "",
    tipo_dato: meta?.tipo_dato || column.dataType || column.type || ""
  };
}

function openTextModal(item, column) {
  const rowKey = getPrimaryKey(item);
  const value = formatValue(getValue(item, column));
  const readonly = isDisplayReadonlyColumn(column);
  state.activeTextModal = { item, column };

  els.textModalTitle.textContent = column.label;
  els.textModalMeta.textContent = `${rowKey || "Sin key"} · ${column.key}`;
  els.textModalValue.value = value;
  els.textModalValue.readOnly = readonly;
  els.saveTextModal.classList.toggle("hidden", readonly);
  els.openCommentComposer.classList.toggle("hidden", !isCommentColumn(column));
  els.commentComposer.classList.add("hidden");
  els.newCommentValue.value = "";
  els.commentTarget.value = column.key.includes("iniciativa") ? "iniciativa" : "mvp";
  els.textModal.classList.remove("hidden");
  els.textModalValue.focus();
}

function closeTextModal() {
  els.textModal.classList.add("hidden");
  els.commentComposer.classList.add("hidden");
  state.activeTextModal = null;
}

function saveTextModalValue() {
  if (!state.activeTextModal) return;
  const { item, column } = state.activeTextModal;
  saveCell(item, column.key, els.textModalValue.value);
  closeTextModal();
}

function stageNewComment() {
  if (!state.activeTextModal) return;
  const text = els.newCommentValue.value.trim();
  if (!text) {
    setSaveState("Escribe el comentario nuevo antes de prepararlo.", true);
    return;
  }

  const { item } = state.activeTextModal;
  const target = els.commentTarget.value === "iniciativa" ? "iniciativa" : "mvp";
  const field = commentFieldKeys[target];
  const column = getColumn(field);
  if (!column) {
    setSaveState("No se encontro la columna de comentario configurada.", true);
    return;
  }

  saveCell(item, field, text);
  closeTextModal();
}

function createEditor(item, column) {
  const readonly = isDisplayReadonlyColumn(column);
  const rawValue = getValue(item, column);
  const value = formatValue(rawValue);
  const rowKey = getPrimaryKey(item);
  const pending = isCellPending(rowKey, column.key);
  const commonClass = `cell-value${readonly ? " cell-readonly" : ""}${pending ? " cell-pending" : ""}`;

  if (column.linkPath || column.linkPaths?.length) {
    const url = getLinkValue(item, column);
    if (url) {
      const link = document.createElement("a");
      link.className = "cell-value cell-link-value";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = value || url;
      return link;
    }
  }

  if (isLongTextColumn(column, rawValue)) {
    return createTextPreview(item, column, readonly, value, pending);
  }

  if (column.type === "select") {
    const options = getCellOptions(item, column, [value]);
    return createChoiceCell(item, column, value, options, false, readonly, pending);
  }

  if (column.type === "multiselect") {
    const currentValues = Array.isArray(rawValue)
      ? rawValue.map(formatValue).filter(Boolean)
      : splitMultipleValues(value);
    const optionValues = getCellOptions(item, column, currentValues);

    if (optionValues.length) {
      return createChoiceCell(item, column, currentValues, optionValues, true, readonly, pending);
    }

    const input = document.createElement("input");
    input.className = commonClass;
    input.readOnly = readonly;
    input.type = "text";
    input.value = currentValues.join(" | ");
    if (!readonly) {
      input.addEventListener("change", () => {
        const selected = splitMultipleValues(input.value);
        saveCell(item, column.key, selected.join(" | "));
      });
    }
    return input;
  }

  if (column.type === "boolean") {
    const input = document.createElement("input");
    input.className = commonClass;
    input.disabled = readonly;
    input.type = "checkbox";
    input.checked = Boolean(rawValue);
    if (!readonly) input.addEventListener("change", () => saveCell(item, column.key, input.checked));
    return input;
  }

  const input = document.createElement("input");
  input.className = commonClass;
  input.readOnly = readonly;
  input.type = column.type === "number" ? "number" : "text";
  input.value = value;
  if (!readonly) {
    input.addEventListener("change", () => {
      const nextValue = column.type === "number"
        ? (input.value.trim() === "" ? null : Number(input.value))
        : input.value;
      saveCell(item, column.key, nextValue);
    });
  }
  return input;
}

function renderTableBody() {
  const tbody = els.dataTable.querySelector("tbody");
  const columns = state.selectedColumns.map(getColumn).filter(Boolean);
  const pagination = getPaginationState();
  const rows = pagination.pageRows;
  tbody.innerHTML = "";

  rows.forEach((item) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      td.style.width = `${column.width || 160}px`;
      td.append(createEditor(item, column));
      tr.append(td);
    });
    tbody.append(tr);
  });

  renderMetrics();
  renderPagination(pagination);
}

async function saveCell(item, field, value) {
  const id = getPrimaryKey(item);
  const column = getColumn(field);
  if (!id || !column) return;

  state.pendingChanges[id] = {
    ...(state.pendingChanges[id] || {}),
    [field]: getChangePayload(item, column, value)
  };
  setValue(item, column, value);
  item.actualizado_en = new Date().toISOString();
  renderMetrics();
  renderTableBody();
  setSaveState("Cambio pendiente. Presiona Guardar vista para enviarlo.");
}

function setSaveState(message, isError = false) {
  els.saveState.textContent = message;
  els.saveState.style.color = isError ? "var(--danger)" : "var(--muted)";
  if (!isError && message) {
    window.clearTimeout(setSaveState.timer);
    setSaveState.timer = window.setTimeout(() => {
      els.saveState.textContent = "";
    }, 2400);
  }
}

function formatLastUpdated(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function dataLoadMessage(prefix) {
  const lastUpdated = formatLastUpdated(state.lastDataUpdated);
  return lastUpdated ? `${prefix}. Ultima actualizacion: ${lastUpdated}.` : `${prefix}.`;
}

function setLoadingProgress(value) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  if (els.loadingProgressBar) els.loadingProgressBar.style.width = `${progress}%`;
  if (els.loadingPercent) els.loadingPercent.textContent = `${progress}%`;
}

function startSoftLoadingProgress(from = 12, ceiling = 88) {
  stopSoftLoadingProgress();
  setLoadingProgress(from);
  let progress = from;
  startSoftLoadingProgress.timer = window.setInterval(() => {
    progress = Math.min(ceiling, progress + Math.max(1, Math.round((ceiling - progress) * 0.12)));
    setLoadingProgress(progress);
    if (progress >= ceiling) stopSoftLoadingProgress();
  }, 650);
}

function stopSoftLoadingProgress(finalValue) {
  window.clearInterval(startSoftLoadingProgress.timer);
  if (typeof finalValue === "number") setLoadingProgress(finalValue);
}

function setLoadingMessage(title, detail, progress) {
  const titleNode = els.loadingOverlay?.querySelector("strong");
  const detailNode = els.loadingOverlay?.querySelector("span");
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
  if (typeof progress === "number") setLoadingProgress(progress);
}

function updateDataSnapshot(result = {}) {
  if (Array.isArray(result.columns) && result.columns.length) state.config.columns = result.columns;
  state.initiatives = result.initiatives || [];
  state.lastDataUpdated = result.lastUpdated || "";
  state.fieldSettings = sanitizeFieldSettings(state.fieldSettings);
}

function activateView(id) {
  const view = state.views.find((item) => item.id === id) || state.views[0];
  if (!view) return;
  clearDraftState();
  state.activeViewId = view.id;
  state.activeView = view;
  state.selectedColumns = [...view.columns];
  syncSelectedColumns();
  state.filters = sanitizeSavedFilters(view.filters || {});
  state.columnFilters = {};
  resetPagination();
  els.viewName.value = view.name;
  renderViews();
  renderSavedFilters();
  renderColumnsChecklist();
  renderFieldSettingsList();
  renderTable();
}

async function requestActivateView(id) {
  if (id === state.activeViewId) return;

  if (hasPendingChanges()) {
    const shouldSave = window.confirm("Hay cambios pendientes. ¿Quieres guardarlos antes de cambiar de vista?");
    if (shouldSave) {
      await saveActiveView();
    } else {
      clearDraftState();
    }
  }

  activateView(id);
}

async function saveActiveView() {
  await persistActiveView({ reactivate: true, message: "Vista guardada." });
}

async function persistActiveView({ reactivate = false, message = "" } = {}) {
  const payload = {
    view: {
      id: state.activeViewId,
      name: els.viewName.value.trim() || "Vista sin nombre",
      columns: state.selectedColumns,
      filters: state.filters
    },
    changes: state.pendingChanges
  };
  const result = await api(`/api/views/${encodeURIComponent(state.activeViewId)}/save`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (result.initiatives) state.initiatives = result.initiatives;
  state.views = state.views.map((view) => (view.id === result.view.id ? result.view : view));
  state.activeView = result.view;
  clearDraftState();
  if (reactivate) {
    activateView(result.view.id);
  } else {
    renderViews();
  }
  if (message) setSaveState(message);
  return result.view;
}

async function createView() {
  if (hasPendingChanges()) {
    const shouldSave = window.confirm("Hay cambios pendientes. ¿Quieres guardarlos antes de crear otra vista?");
    if (shouldSave) {
      await saveActiveView();
    } else {
      clearDraftState();
    }
  }

  const payload = {
    name: "Nueva vista",
    columns: state.selectedColumns.length ? state.selectedColumns : getAvailableColumns().slice(0, 6).map((column) => column.key),
    filters: {}
  };
  const result = await api("/api/views", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.views = [...state.views, result.view];
  activateView(result.view.id);
  els.viewName.focus();
  els.viewName.select();
}

async function deleteActiveView() {
  if (!state.activeViewId) return;
  if (hasPendingChanges()) {
    const shouldSave = window.confirm("Hay cambios pendientes. ¿Quieres guardarlos antes de eliminar la vista?");
    if (shouldSave) await saveActiveView();
  }
  const viewName = els.viewName.value.trim() || "esta vista";
  const shouldDelete = window.confirm(`Eliminar "${viewName}"? Esta accion no elimina iniciativas, solo la vista guardada.`);
  if (!shouldDelete) return;

  try {
    await api(`/api/views/${encodeURIComponent(state.activeViewId)}`, {
      method: "DELETE"
    });
    await loadViews();
    activateView(state.views[0]?.id);
    setSaveState("Vista eliminada.");
  } catch (error) {
    setSaveState(error.message, true);
  }
}

async function loadConfig() {
  state.config = await api("/api/config");
}

async function loadInitiatives() {
  const result = await api("/api/initiatives");
  updateDataSnapshot(result);
}

async function loadViews() {
  const result = await api("/api/views");
  state.views = result.views;
}

async function loadFieldSettings() {
  const result = await api("/api/field-settings");
  state.fieldSettings = sanitizeFieldSettings(result.fieldSettings || {});
  state.fieldSettingsDirty = false;
}

async function saveGlobalFieldSettings() {
  try {
    const result = await api("/api/field-settings", {
      method: "PUT",
      body: JSON.stringify({ fieldSettings: state.fieldSettings })
    });
    state.fieldSettings = sanitizeFieldSettings(result.fieldSettings || {});
    state.fieldSettingsDirty = false;
    syncSelectedColumns();
    renderColumnsChecklist();
    renderFieldSettingsList();
    renderTable();
    setSaveState("Configuracion de campos guardada.");
  } catch (error) {
    setSaveState(error.message, true);
  }
}

async function refreshData(options = {}) {
  const { skipPrompt = false } = options;
  if (!skipPrompt && hasPendingChanges()) {
    const shouldSave = window.confirm("Hay cambios pendientes. ¿Quieres guardarlos antes de actualizar la información?");
    if (shouldSave) {
      await saveActiveView();
    } else {
      clearDraftState();
    }
  }

  setLoadingMessage("Actualizando informacion", "Buscando cambios recientes y preparando la vista...", 8);
  els.loadingOverlay.classList.remove("hidden");
  startSoftLoadingProgress(14, 86);
  try {
    const result = await api("/api/refresh", { method: "POST" });
    setLoadingMessage("Actualizando informacion", "Organizando los datos para mostrar la tabla...", 92);
    updateDataSnapshot(result);
    syncSelectedColumns();
    resetPagination();
    renderSavedFilters();
    renderColumnsChecklist();
    renderFieldSettingsList();
    renderTable();
    const seconds = result.timings?.totalMs ? ` en ${(result.timings.totalMs / 1000).toFixed(1)}s` : "";
    setSaveState(dataLoadMessage(`Informacion actualizada${seconds}`));
  } catch (error) {
    setSaveState(error.message, true);
  } finally {
    stopSoftLoadingProgress(100);
    els.loadingOverlay.classList.add("hidden");
  }
}

function exportActiveView() {
  if (!state.activeViewId) return;
  window.location.href = `/api/views/${encodeURIComponent(state.activeViewId)}/export`;
}

function toggleViewsPanel() {
  const collapsed = els.workspaceShell.classList.toggle("views-collapsed");
  els.toggleViewsButton.textContent = collapsed ? "›" : "‹";
  els.toggleViewsButton.title = collapsed ? "Mostrar vistas" : "Ocultar vistas";
}

function updateSavedFilter(field, value, keepOpen = false) {
  const values = normalizeFilterValues(value);
  if (values.length) {
    state.filters[field] = values;
  } else {
    delete state.filters[field];
  }
  state.openFilterKey = keepOpen ? field : null;
  resetPagination();
  renderSavedFilters();
  renderTable();
  markConfigDirty("Filtros superiores pendientes de guardar.");
}

function bindScrollSync() {
  let syncing = false;
  const sync = (source, target) => {
    if (syncing) return;
    syncing = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncing = false;
    });
  };

  els.topScroll.addEventListener("scroll", () => sync(els.topScroll, els.sheetWrapper));
  els.sheetWrapper.addEventListener("scroll", () => sync(els.sheetWrapper, els.topScroll));
}

function bindEvents() {
  els.saveViewButton.addEventListener("click", saveActiveView);
  els.deleteViewButton.addEventListener("click", deleteActiveView);
  els.newViewButton.addEventListener("click", createView);
  els.toggleViewsButton.addEventListener("click", toggleViewsPanel);
  els.refreshButton.addEventListener("click", refreshData);
  els.exportButton.addEventListener("click", exportActiveView);
  els.fieldSettingsButton?.addEventListener("click", openFieldSettingsModal);
  els.closeFieldSettingsModal?.addEventListener("click", closeFieldSettingsModal);
  els.fieldSettingsModal?.addEventListener("click", (event) => {
    if (event.target === els.fieldSettingsModal) closeFieldSettingsModal();
  });
  els.fieldSettingsSearch?.addEventListener("input", () => {
    state.fieldSettingsSearch = els.fieldSettingsSearch.value;
    renderFieldSettingsList();
  });
  els.saveFieldSettingsButton?.addEventListener("click", saveGlobalFieldSettings);
  els.closeChartModal.addEventListener("click", closeChartModal);
  els.chartModal.addEventListener("click", (event) => {
    if (event.target === els.chartModal) closeChartModal();
  });
  els.closeTextModal.addEventListener("click", closeTextModal);
  els.textModal.addEventListener("click", (event) => {
    if (event.target === els.textModal) closeTextModal();
  });
  els.saveTextModal.addEventListener("click", saveTextModalValue);
  els.openCommentComposer.addEventListener("click", () => {
    els.commentComposer.classList.toggle("hidden");
    if (!els.commentComposer.classList.contains("hidden")) els.newCommentValue.focus();
  });
  els.stageCommentButton.addEventListener("click", stageNewComment);
  document.querySelectorAll(".expand-chart-button").forEach((button) => {
    button.addEventListener("click", () => openChartModal(button.dataset.chart));
  });
  els.columnsButton.addEventListener("click", () => els.columnsPopover.classList.toggle("hidden"));
  els.closeColumnsButton.addEventListener("click", () => els.columnsPopover.classList.add("hidden"));
  els.columnsSearch.addEventListener("input", () => {
    state.columnSearch = els.columnsSearch.value;
    renderColumnsChecklist();
  });
  els.clearSavedFilters.addEventListener("click", () => {
    state.filters = {};
    state.openFilterKey = null;
    resetPagination();
    renderSavedFilters();
    renderTable();
    markConfigDirty("Filtros superiores pendientes de guardar.");
  });
  els.viewsSearch.addEventListener("input", () => {
    state.viewSearch = els.viewsSearch.value;
    renderViews();
  });
  els.viewName.addEventListener("input", () => {
    markConfigDirty("Nombre de vista pendiente de guardar.");
  });
  els.viewName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveActiveView();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasAnyPendingChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("click", () => {
    state.openFilterKey = null;
    document.querySelectorAll(".multi-filter-menu").forEach((node) => node.classList.add("hidden"));
    document.querySelectorAll(".cell-choice-menu").forEach((node) => node.classList.add("hidden"));
  });
  bindScrollSync();
}

async function init() {
  bindEvents();
  setLoadingMessage("Cargando informacion", "Preparando tu vista de trabajo...", 8);
  els.loadingOverlay.classList.remove("hidden");
  try {
    setLoadingMessage("Cargando informacion", "Cargando configuracion y vistas guardadas...", 25);
    await loadConfig();
    await Promise.all([loadViews(), loadFieldSettings()]);
    setLoadingMessage("Cargando informacion", "Consultando la informacion disponible...", 55);
    await loadInitiatives();
    setLoadingMessage("Cargando informacion", "Armando tabla, filtros y graficas...", 85);
    activateView(state.views[0]?.id);
    setLoadingProgress(100);
    setSaveState(dataLoadMessage("Datos listos"));
  } finally {
    els.loadingOverlay.classList.add("hidden");
  }
}

init().catch((error) => {
  setSaveState(error.message, true);
});
