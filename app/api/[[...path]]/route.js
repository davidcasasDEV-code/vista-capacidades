import { NextResponse } from "next/server";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildColumnDefinitions,
  config,
  defaultViewColumns,
  getNestedValue,
  isFieldEnvelope,
  metricFields,
  readonlyFields,
  unwrapFieldValue
} = require("../../../src/config");
const { scanInitiatives, saveInitiativeChanges, refreshInitiatives } = require("../../../src/dataStore");
const viewsStore = require("../../../src/viewsStore");
const { exportViewAsExcelHtml } = require("../../../src/excelExport");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status });
}

const essentialFieldKeys = [
  "top:key_mvp",
  "top:key_iniciativa",
  "top:nombre_mvp",
  "top:nombre_iniciativa",
  "top:id_mvp",
  "top:id_iniciativa",
  "top:actualizado_en",
  "top:url_mvp",
  "top:url_mpv",
  "top:url_iniciativa",
  "top:ulr_iniciativa",
  "top:ultimo_comentario_mvp",
  "top:ultimo_comentario_iniciativa"
];

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseRequestedFields(url, fallback = []) {
  const raw = url.searchParams.get("fields") || "";
  const requested = raw.split(",").map((field) => field.trim()).filter(Boolean);
  return unique([...essentialFieldKeys, ...Object.values(metricFields), ...fallback, ...requested]);
}

function setNestedValue(target, pathSegments, value) {
  if (!Array.isArray(pathSegments) || !pathSegments.length) return;
  let cursor = target;
  pathSegments.slice(0, -1).forEach((segment) => {
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
  cursor[pathSegments[pathSegments.length - 1]] = value;
}

function compactValue(value) {
  if (isFieldEnvelope(value)) {
    return {
      valor: unwrapFieldValue(value)
    };
  }

  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }

  return value;
}

function copyPath(source, target, pathSegments) {
  if (!Array.isArray(pathSegments) || !pathSegments.length) return;
  const value = getNestedValue(source, pathSegments);
  if (value === undefined) return;
  setNestedValue(target, pathSegments, compactValue(value));
}

function getColumnCopyPath(item, column) {
  if (column?.metaPath && isFieldEnvelope(getNestedValue(item, column.metaPath))) {
    return column.metaPath;
  }
  return column?.path;
}

function compactInitiatives(items, columns, fieldKeys) {
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  const requested = unique([...essentialFieldKeys, ...fieldKeys]);

  return items.map((item) => {
    const compact = {};

    requested.forEach((fieldKey) => {
      const column = columnsByKey.get(fieldKey);
      if (!column) return;

      copyPath(item, compact, getColumnCopyPath(item, column));
      (column.linkPaths || []).forEach((path) => copyPath(item, compact, path));
      if (column.linkPath) copyPath(item, compact, column.linkPath);
    });

    copyPath(item, compact, ["actualizado_en"]);
    copyPath(item, compact, ["portal_actualizado_en"]);
    copyPath(item, compact, ["parent_refs"]);
    copyPath(item, compact, ["tiene_iniciativa_padre"]);
    return compact;
  });
}

function buildInitiativesResponse(items, url, fallbackFields = []) {
  const columns = buildColumnDefinitions(items);
  const fields = parseRequestedFields(url, fallbackFields);
  return {
    initiatives: compactInitiatives(items, columns, fields),
    columns,
    lastUpdated: getLatestUpdatedAt(items),
    meta: {
      compacted: true,
      total: items.length,
      fields
    }
  };
}

function getLatestUpdatedAt(items = []) {
  return items.reduce((latest, item) => {
    const value = item?.actualizado_en || item?.iniciativa_padre?.actualizado_en;
    if (!value) return latest;
    if (!latest) return value;

    const currentTime = Date.parse(value);
    const latestTime = Date.parse(latest);
    if (Number.isFinite(currentTime) && (!Number.isFinite(latestTime) || currentTime > latestTime)) {
      return value;
    }

    if (!Number.isFinite(currentTime) && String(value) > String(latest)) {
      return value;
    }

    return latest;
  }, "");
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("El cuerpo de la peticion no es JSON valido.");
    error.statusCode = 400;
    throw error;
  }
}

function apiPath(params) {
  const parts = params?.path || [];
  return `/api/${parts.join("/")}`.replace(/\/$/, "");
}

async function handleApi(request, params) {
  const pathname = apiPath(params);
  const url = new URL(request.url);
  const method = request.method;

  if (method === "GET" && pathname === "/api/config") {
    const columns = buildColumnDefinitions([]);
    return json({
      appName: "Vista Capacidades",
      dataMode: config.dataMode,
      primaryKey: config.dynamoPrimaryKey,
      metricFields,
      readonlyFields,
      columns
    });
  }

  if (method === "GET" && pathname === "/api/initiatives") {
    const initiatives = await scanInitiatives();
    return json(buildInitiativesResponse(initiatives, url, defaultViewColumns));
  }

  if (method === "POST" && pathname === "/api/refresh") {
    const startedAt = Date.now();
    const result = await refreshInitiatives();
    const lambdaFinishedAt = Date.now();
    const initiatives = await scanInitiatives();
    const finishedAt = Date.now();
    return json({
      ...result,
      ...buildInitiativesResponse(initiatives, url, defaultViewColumns),
      timings: {
        lambdaMs: lambdaFinishedAt - startedAt,
        dynamoScanMs: finishedAt - lambdaFinishedAt,
        totalMs: finishedAt - startedAt
      }
    });
  }

  if (method === "GET" && pathname === "/api/views") {
    return json({ views: await viewsStore.listViews() });
  }

  if (method === "GET" && pathname === "/api/field-settings") {
    return json({ fieldSettings: await viewsStore.getFieldSettings() });
  }

  if (method === "PUT" && pathname === "/api/field-settings") {
    const body = await readJsonBody(request);
    const fieldSettings = await viewsStore.saveFieldSettings(body);
    return json({ fieldSettings });
  }

  if (method === "POST" && pathname === "/api/views") {
    const body = await readJsonBody(request);
    const view = await viewsStore.saveView(body);
    return json({ view }, 201);
  }

  if (method === "PUT" && pathname.startsWith("/api/views/")) {
    const id = decodeURIComponent(pathname.replace("/api/views/", ""));
    const body = await readJsonBody(request);
    const view = await viewsStore.saveView({ ...body, id });
    return json({ view });
  }

  if (method === "POST" && /^\/api\/views\/[^/]+\/save$/.test(pathname)) {
    const id = decodeURIComponent(pathname.split("/")[3]);
    const body = await readJsonBody(request);
    const viewPayload = body.view || {};
    const changes = body.changes || {};
    const view = await viewsStore.saveView({ ...viewPayload, id });
    const fieldSettings = await viewsStore.getFieldSettings();
    const changeResult = await saveInitiativeChanges(changes, fieldSettings);
    const initiatives = await scanInitiatives();
    return json({
      view,
      savedChanges: {
        updatedRows: changeResult.updated.length,
        lambdaResults: changeResult.lambdaResults
      },
      ...buildInitiativesResponse(initiatives, url, view.columns)
    });
  }

  if (method === "DELETE" && pathname.startsWith("/api/views/")) {
    const id = decodeURIComponent(pathname.replace("/api/views/", ""));
    await viewsStore.deleteView(id);
    return json({ ok: true });
  }

  if (method === "GET" && /^\/api\/views\/[^/]+\/export$/.test(pathname)) {
    const id = decodeURIComponent(pathname.split("/")[3]);
    const view = await viewsStore.getView(id);
    if (!view) return json({ error: "Vista no encontrada." }, 404);

    const initiatives = await scanInitiatives();
    const workbook = exportViewAsExcelHtml({
      view,
      initiatives,
      columnDefinitions: buildColumnDefinitions(initiatives)
    });
    const filename = `${view.name || "vista-capacidades"}.xls`.replace(/[\\/:*?"<>|]+/g, "-");

    return new Response(workbook, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  }

  if (method === "GET" && pathname === "/api/debug/env") {
    return json({
      dataMode: config.dataMode,
      tableConfigured: Boolean(config.dynamoTableName),
      dataTableName: config.dynamoTableName,
      viewsTableName: config.viewsDynamoTableName,
      refreshLambdaName: config.refreshLambdaName,
      backendLambdaName: config.backendLambdaName,
      lambdaConfigured: Boolean(config.refreshLambdaName),
      requestedView: url.searchParams.get("view")
    });
  }

  return json({ error: "Endpoint no encontrado." }, 404);
}

async function safeHandle(request, context) {
  try {
    const params = await context.params;
    return await handleApi(request, params);
  } catch (error) {
    return json({
      error: error.message || "Error interno.",
      details: process.env.NODE_ENV === "production" ? undefined : error.stack
    }, error.statusCode || 500);
  }
}

export async function GET(request, context) { return safeHandle(request, context); }
export async function POST(request, context) { return safeHandle(request, context); }
export async function PUT(request, context) { return safeHandle(request, context); }
export async function DELETE(request, context) { return safeHandle(request, context); }
