const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { config, defaultViewColumns, isKnownColumnKey } = require("./config");
const { createClients } = require("./awsClients");

const defaultColumns = defaultViewColumns;
let awsClients;
const SETTINGS_RECORD_ID = "__portal_field_settings__";

function isSettingsRecord(record) {
  return record?.id === SETTINGS_RECORD_ID || record?.type === "portal-settings";
}

function buildSettingsRecord(fieldSettings = {}) {
  const now = new Date().toISOString();
  const normalized = normalizeFieldSettings(fieldSettings);
  return {
    id: SETTINGS_RECORD_ID,
    type: "portal-settings",
    fieldSettings: normalized,
    configuracion: {
      campos: normalized
    },
    updatedAt: now
  };
}

function normalizeColumnKey(column) {
  if (column === "top:iniciativa_padre.ultimo_comentario_iniciativa") {
    return "top:ultimo_comentario_iniciativa";
  }
  if (column === "iniciativa:Comentario") {
    return "top:ultimo_comentario_iniciativa";
  }
  return column;
}

function normalizeFieldSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  return Object.entries(input).reduce((acc, [key, settings]) => {
    if (!isKnownColumnKey(key) || !settings || typeof settings !== "object" || Array.isArray(settings)) return acc;
    const normalized = {};
    if (typeof settings.hidden === "boolean") normalized.hidden = settings.hidden;
    if (typeof settings.readonly === "boolean") normalized.readonly = settings.readonly;
    if (Object.keys(normalized).length) acc[key] = normalized;
    return acc;
  }, {});
}

async function readViews() {
  try {
    const raw = await fs.readFile(config.viewsPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeViews(views) {
  await fs.mkdir(path.dirname(config.viewsPath), { recursive: true });
  await fs.writeFile(config.viewsPath, JSON.stringify(views, null, 2), "utf8");
}

function getAwsClients() {
  if (!awsClients) awsClients = createClients();
  return awsClients;
}

function normalizeView(input) {
  const now = new Date().toISOString();
  const selectedColumns = input.columns || input.configuracion?.camposSeleccionados || input.configuracion?.ordenColumnas;
  const columns = Array.isArray(selectedColumns)
    ? selectedColumns.map(normalizeColumnKey).filter((column) => isKnownColumnKey(column))
    : defaultColumns;
  const filters = input.filters || input.configuracion?.filtros;
  const sort = input.sort || input.configuracion?.ordenamiento;

  const normalized = {
    id: input.id || crypto.randomUUID(),
    name: String(input.name || "Nueva vista").trim(),
    columns: columns.length ? columns : defaultColumns,
    filters: filters && typeof filters === "object" ? filters : {},
    sort: sort && typeof sort === "object" ? sort : null,
    createdAt: input.createdAt || now,
    updatedAt: now
  };

  return {
    ...normalized,
    configuracion: {
      camposSeleccionados: normalized.columns,
      ordenColumnas: normalized.columns,
      filtros: normalized.filters,
      ordenamiento: normalized.sort
    }
  };
}

function buildDefaultView() {
  return normalizeView({
    id: "vista-general",
    name: "Vista general",
    columns: defaultColumns,
    filters: {}
  });
}

function isConditionalWriteFailure(error) {
  return error?.name === "ConditionalCheckFailedException";
}

async function readViewsFromDynamo() {
  if (!config.viewsDynamoTableName) {
    throw new Error("Falta VIEWS_DYNAMODB_TABLE_NAME para guardar vistas en DynamoDB.");
  }

  const { docClient, ScanCommand } = getAwsClients();
  const views = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: config.viewsDynamoTableName,
      ExclusiveStartKey
    }));
    views.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return views;
}

async function getViewFromDynamo(id) {
  const { docClient, GetCommand } = getAwsClients();
  const result = await docClient.send(new GetCommand({
    TableName: config.viewsDynamoTableName,
    Key: {
      [config.viewsDynamoPrimaryKey]: id
    }
  }));
  return result.Item || null;
}

async function putViewInDynamo(view, options = {}) {
  const { docClient, PutCommand } = getAwsClients();
  const item = {
    ...view,
    [config.viewsDynamoPrimaryKey]: view.id
  };
  const command = {
    TableName: config.viewsDynamoTableName,
    Item: item
  };

  if (options.preventOverwrite) {
    command.ConditionExpression = "attribute_not_exists(#id)";
    command.ExpressionAttributeNames = {
      "#id": config.viewsDynamoPrimaryKey
    };
  }

  await docClient.send(new PutCommand(command));
  return item;
}

async function createViewInDynamo(input) {
  let attempts = 0;

  while (attempts < 5) {
    attempts += 1;
    const view = normalizeView({
      ...input,
      id: input.id || crypto.randomUUID()
    });

    try {
      return await putViewInDynamo(view, { preventOverwrite: true });
    } catch (error) {
      if (isConditionalWriteFailure(error) && !input.id) continue;
      if (isConditionalWriteFailure(error)) {
        const friendly = new Error(`Ya existe una vista con id '${view.id}'.`);
        friendly.statusCode = 409;
        throw friendly;
      }
      throw error;
    }
  }

  throw new Error("No fue posible generar un id unico para la vista.");
}

async function listViews() {
  if (config.dataMode === "aws") {
    const views = await readViewsFromDynamo();
    const viewItems = views.filter((view) => !isSettingsRecord(view));
    if (viewItems.length) return viewItems.map(normalizeView);

    const view = await createViewInDynamo(buildDefaultView());
    return [view];
  }

  const views = await readViews();
  const viewItems = views.filter((view) => !isSettingsRecord(view));
  if (viewItems.length) return viewItems.map(normalizeView);

  const defaultView = buildDefaultView();
  await writeViews([...views, defaultView]);
  return [defaultView];
}

async function getView(id) {
  if (config.dataMode === "aws") {
    const view = await getViewFromDynamo(id);
    if (isSettingsRecord(view)) return null;
    return view ? normalizeView(view) : null;
  }

  const views = await listViews();
  return views.find((view) => view.id === id);
}

async function saveView(input) {
  if (config.dataMode === "aws") {
    const existing = input.id ? await getViewFromDynamo(input.id) : null;

    if (!input.id) {
      return createViewInDynamo(input);
    }

    const normalized = normalizeView({
      ...existing,
      ...input,
      createdAt: existing?.createdAt
    });

    if (!existing) {
      return createViewInDynamo(normalized);
    }

    return putViewInDynamo(normalized);
  }

  const records = await readViews();
  const views = records.filter((view) => !isSettingsRecord(view)).map(normalizeView);
  const existing = input.id ? views.find((view) => view.id === input.id) : null;
  const normalized = normalizeView({
    ...existing,
    ...input,
    createdAt: existing?.createdAt
  });

  const nextViews = existing
    ? records.map((record) => (record.id === normalized.id ? normalized : record))
    : [...records, normalized];

  await writeViews(nextViews);
  return normalized;
}

async function deleteView(id) {
  if (id === SETTINGS_RECORD_ID) return;

  if (config.dataMode === "aws") {
    const { docClient, DeleteCommand } = getAwsClients();
    await docClient.send(new DeleteCommand({
      TableName: config.viewsDynamoTableName,
      Key: {
        [config.viewsDynamoPrimaryKey]: id
      }
    }));
    return;
  }

  const views = await readViews();
  const nextViews = views.filter((view) => view.id !== id);
  await writeViews(nextViews.length ? nextViews : []);
}

function extractFieldSettings(record) {
  return normalizeFieldSettings(record?.fieldSettings || record?.configuracion?.campos || {});
}

function fallbackFieldSettings(records = []) {
  const record = records.find((item) => !isSettingsRecord(item) && Object.keys(extractFieldSettings(item)).length);
  return record ? extractFieldSettings(record) : {};
}

async function getFieldSettings() {
  if (config.dataMode === "aws") {
    const record = await getViewFromDynamo(SETTINGS_RECORD_ID);
    if (record) return extractFieldSettings(record);
    return fallbackFieldSettings(await readViewsFromDynamo());
  }

  const records = await readViews();
  const record = records.find(isSettingsRecord);
  if (record) return extractFieldSettings(record);
  return fallbackFieldSettings(records);
}

async function saveFieldSettings(input = {}) {
  const settingsInput = input.fieldSettings || input.configuracion?.campos || input;
  const record = buildSettingsRecord(settingsInput);

  if (config.dataMode === "aws") {
    await putViewInDynamo(record);
    return record.fieldSettings;
  }

  const records = await readViews();
  const hasRecord = records.some(isSettingsRecord);
  const nextRecords = hasRecord
    ? records.map((item) => (isSettingsRecord(item) ? record : item))
    : [...records, record];
  await writeViews(nextRecords);
  return record.fieldSettings;
}

module.exports = {
  listViews,
  getView,
  saveView,
  deleteView,
  getFieldSettings,
  saveFieldSettings
};
