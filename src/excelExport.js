const { getNestedValue } = require("./config");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matchesFilters(item, filters, definitions) {
  return Object.entries(filters || {}).every(([field, expected]) => {
    const filtersToMatch = Array.isArray(expected)
      ? expected.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean)
      : [String(expected ?? "").trim().toLowerCase()].filter(Boolean);
    if (!filtersToMatch.length) return true;
    const column = definitions.get(field);
    const value = column ? getNestedValue(item, column.path) : item[field];
    const values = splitMultipleValues(value).map((entry) => entry.toLowerCase());
    return values.some((entry) => filtersToMatch.includes(entry));
  });
}

function formatValue(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("valor" in value || "tipo_dato" in value || "opciones" in value)
  ) {
    return formatValue(value.valor);
  }

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

  return value ?? "";
}

function splitMultipleValues(value) {
  return String(formatValue(value))
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getLinkValue(item, column) {
  const paths = [...(column.linkPaths || []), column.linkPath].filter(Boolean);
  const seen = new Set();

  for (const path of paths) {
    const key = path.join(".");
    if (seen.has(key)) continue;
    seen.add(key);
    const value = formatValue(getNestedValue(item, path));
    if (value) return value;
  }

  return "";
}

function exportViewAsExcelHtml({ view, initiatives, columnDefinitions }) {
  const definitions = new Map(columnDefinitions.map((column) => [column.key, column]));
  const columns = view.columns.map((key) => definitions.get(key)).filter(Boolean);
  const rows = initiatives.filter((item) => matchesFilters(item, view.filters, definitions));

  const header = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const body = rows
    .map((item) => {
      const cells = columns.map((column) => {
        const value = formatValue(getNestedValue(item, column.path));
        const url = column.linkPath || column.linkPaths?.length ? getLinkValue(item, column) : "";
        const content = url
          ? `<a href="${escapeHtml(url)}">${escapeHtml(value || url)}</a>`
          : escapeHtml(value);
        return `<td>${content}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #1f497d; color: #fff; font-weight: bold; }
    th, td { border: 1px solid #9eb6ce; padding: 6px 8px; white-space: nowrap; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

module.exports = {
  exportViewAsExcelHtml
};
