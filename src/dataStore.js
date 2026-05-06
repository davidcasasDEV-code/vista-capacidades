const fs = require("node:fs/promises");
const { config, getColumnDefinition, setNestedValue } = require("./config");
const { createClients } = require("./awsClients");

let awsClients;

async function ensureLocalDataFile() {
  try {
    await fs.access(config.localDataPath);
  } catch {
    const seed = await fs.readFile(config.mockDataPath, "utf8");
    await fs.writeFile(config.localDataPath, seed, "utf8");
  }
}

async function readLocalInitiatives() {
  await ensureLocalDataFile();
  const raw = await fs.readFile(config.localDataPath, "utf8");
  return JSON.parse(raw);
}

async function writeLocalInitiatives(items) {
  await fs.writeFile(config.localDataPath, JSON.stringify(items, null, 2), "utf8");
}

function getAwsClients() {
  if (!awsClients) awsClients = createClients();
  return awsClients;
}

function isInitiativeItem(item) {
  const key = String(item?.[config.dynamoPrimaryKey] || "");
  return Boolean(key) && !key.startsWith("__") && item?.type !== "jira-sync-state";
}

async function scanInitiatives() {
  if (config.dataMode !== "aws") {
    const items = await readLocalInitiatives();
    return items.filter(isInitiativeItem);
  }

  if (!config.dynamoTableName) {
    throw new Error("Falta DYNAMODB_TABLE_NAME para leer DynamoDB.");
  }

  const { docClient, ScanCommand } = getAwsClients();
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: config.dynamoTableName,
      ExclusiveStartKey
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items.filter(isInitiativeItem);
}

function normalizeChangeInput(change) {
  if (
    change &&
    typeof change === "object" &&
    !Array.isArray(change) &&
    ("valor" in change || "tipo_dato" in change || "id" in change)
  ) {
    return {
      value: change.valor,
      fieldId: change.id || "",
      dataType: change.tipo_dato || "",
      raw: change
    };
  }

  return {
    value: change,
    fieldId: "",
    dataType: "",
    raw: change
  };
}

function normalizeDataType(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEditableField(field, changeMeta = {}, fieldSettings = {}) {
  const column = getColumnDefinition(field);
  if (!column) {
    const error = new Error("Campo no reconocido.");
    error.statusCode = 400;
    throw error;
  }
  const isReadonlyByView = Boolean(fieldSettings[field]?.readonly);
  const isReadonlyByType = normalizeDataType(changeMeta.dataType || column.dataType) === "no editable";
  if (column.readonly || isReadonlyByView || isReadonlyByType) {
    const error = new Error(`El campo '${field}' esta marcado como solo lectura.`);
    error.statusCode = 409;
    throw error;
  }
  return column;
}

function getColumnUpdatePath(column, changeMeta) {
  const isStructuredField = Boolean(changeMeta.fieldId || changeMeta.dataType || column.fieldId || column.dataType);
  if (isStructuredField && column.scope && column.metaPath) return [...column.metaPath, "valor"];
  return column.path;
}

function normalizeChanges(changesByKey = {}, fieldSettings = {}) {
  return Object.entries(changesByKey).reduce((acc, [key, fields]) => {
    if (!key || !fields || typeof fields !== "object") return acc;

    const validFields = Object.entries(fields).reduce((fieldAcc, [field, change]) => {
      const changeMeta = normalizeChangeInput(change);
      const column = validateEditableField(field, changeMeta, fieldSettings);
      fieldAcc[field] = {
        column,
        value: changeMeta.value,
        fieldId: changeMeta.fieldId || column.fieldId || "",
        dataType: changeMeta.dataType || column.dataType || "",
        updatePath: getColumnUpdatePath(column, changeMeta)
      };
      return fieldAcc;
    }, {});

    if (Object.keys(validFields).length) acc[key] = validFields;
    return acc;
  }, {});
}

async function updateLocalInitiatives(changesByKey) {
  const initiatives = await readLocalInitiatives();
  const updated = [];

  Object.entries(changesByKey).forEach(([id, fields]) => {
    const index = initiatives.findIndex((item) => String(item[config.dynamoPrimaryKey]) === String(id));
    if (index === -1) {
      const error = new Error(`Iniciativa '${id}' no encontrada.`);
      error.statusCode = 404;
      throw error;
    }

    Object.values(fields).forEach(({ updatePath, value }) => {
      setNestedValue(initiatives[index], updatePath, value);
    });
    initiatives[index].actualizado_en = new Date().toISOString();
    updated.push(initiatives[index]);
  });

  await writeLocalInitiatives(initiatives);
  return updated;
}

async function updateDynamoInitiatives(changesByKey) {
  if (!config.dynamoTableName) {
    throw new Error("Falta DYNAMODB_TABLE_NAME para actualizar DynamoDB.");
  }

  const { docClient, UpdateCommand } = getAwsClients();
  const updated = [];

  for (const [id, fields] of Object.entries(changesByKey)) {
    const updatedAt = new Date().toISOString();
    const expressionNames = {
      "#actualizado_en": "actualizado_en"
    };
    const expressionValues = {
      ":actualizado_en": updatedAt
    };
    const assignments = [];

    Object.values(fields).forEach(({ updatePath, value }, fieldIndex) => {
      const pathExpression = updatePath.map((segment, segmentIndex) => {
        const nameKey = `#f${fieldIndex}_${segmentIndex}`;
        expressionNames[nameKey] = segment;
        return nameKey;
      }).join(".");
      const valueKey = `:v${fieldIndex}`;
      expressionValues[valueKey] = value;
      assignments.push(`${pathExpression} = ${valueKey}`);

      if (updatePath[updatePath.length - 1] === "valor") {
        const metaPathExpression = [...updatePath.slice(0, -1), "portal_actualizado_en"].map((segment, segmentIndex) => {
          const nameKey = `#m${fieldIndex}_${segmentIndex}`;
          expressionNames[nameKey] = segment;
          return nameKey;
        }).join(".");
        const metaValueKey = `:portal_actualizado_en_${fieldIndex}`;
        expressionValues[metaValueKey] = updatedAt;
        assignments.push(`${metaPathExpression} = ${metaValueKey}`);
      }
    });

    assignments.push("#actualizado_en = :actualizado_en");

    const result = await docClient.send(new UpdateCommand({
      TableName: config.dynamoTableName,
      Key: {
        [config.dynamoPrimaryKey]: id
      },
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: "ALL_NEW"
    }));
    updated.push(result.Attributes);
  }

  return updated;
}

async function invokeBackendForChanges(changesByKey) {
  const rows = Object.entries(changesByKey);
  if (!rows.length) return [];

  if (config.dataMode !== "aws") {
    return rows.map(([key, fields]) => ({
      key,
      mode: "mock",
      fields: Object.keys(fields)
    }));
  }

  if (!config.backendLambdaName) {
    throw new Error("Falta BACKEND_LAMBDA_NAME para invocar Lambda de guardado.");
  }

  const { lambdaClient, InvokeCommand } = getAwsClients();
  const results = [];

  for (const [key, fields] of rows) {
    const camposModificados = Object.entries(fields).reduce((acc, [field, { value, fieldId, dataType }]) => {
      acc[field] = {
        valor: value,
        id: fieldId,
        tipo_dato: dataType
      };
      return acc;
    }, {});
    const payload = {
      key,
      campos_modificados: camposModificados
    };

    const result = await lambdaClient.send(new InvokeCommand({
      FunctionName: config.backendLambdaName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload))
    }));

    const decodedPayload = result.Payload
      ? JSON.parse(Buffer.from(result.Payload).toString("utf8") || "{}")
      : {};

    if (result.FunctionError || decodedPayload.statusCode >= 400 || decodedPayload.failedFields > 0) {
      throw new Error(`Backend_Vista_Capacidad no pudo guardar todos los cambios de '${key}': ${JSON.stringify(decodedPayload)}`);
    }

    results.push({
      key,
      lambdaStatusCode: result.StatusCode,
      payload: decodedPayload
    });
  }

  return results;
}

async function saveInitiativeChanges(changesByKey = {}, fieldSettings = {}) {
  const normalized = normalizeChanges(changesByKey, fieldSettings);
  if (!Object.keys(normalized).length) {
    return {
      updated: [],
      lambdaResults: []
    };
  }

  const updated = config.dataMode === "aws"
    ? await updateDynamoInitiatives(normalized)
    : await updateLocalInitiatives(normalized);
  const lambdaResults = await invokeBackendForChanges(normalized);

  return {
    updated,
    lambdaResults
  };
}

async function refreshInitiatives() {
  if (config.dataMode !== "aws") {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      ok: true,
      mode: "mock",
      message: "Refresco simulado. En modo aws se invocara la Lambda configurada."
    };
  }

  if (!config.refreshLambdaName) {
    throw new Error("Falta REFRESH_LAMBDA_NAME para invocar Lambda.");
  }

  const { lambdaClient, InvokeCommand } = getAwsClients();
  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: config.refreshLambdaName,
    InvocationType: "RequestResponse"
  }));

  let payload = null;
  if (result.Payload) {
    const decoded = Buffer.from(result.Payload).toString("utf8");
    payload = decoded ? JSON.parse(decoded) : null;
  }

  return {
    ok: true,
    mode: "aws",
    lambdaStatusCode: result.StatusCode,
    payload
  };
}

module.exports = {
  scanInitiatives,
  saveInitiativeChanges,
  refreshInitiatives
};
