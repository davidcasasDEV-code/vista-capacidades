const path = require("node:path");
const { loadEnvFile } = require("./loadEnv");

loadEnvFile();

function readEnv(name, fallback = "") {
  if (process.env[name] === undefined) return fallback;
  return String(process.env[name]).trim();
}

function listFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function defaultDataMode() {
  if (process.env.DATA_MODE) return String(process.env.DATA_MODE).trim();
  if (process.env.NODE_ENV === "production" || process.env.AWS_BRANCH || process.env.AMPLIFY_APP_ID) return "aws";
  return "mock";
}

const projectRoot = process.cwd();
const dataDir = readEnv("LOCAL_DATA_DIR", path.join(projectRoot, "data"));

const config = {
  port: Number(readEnv("PORT", "3000")),
  dataMode: defaultDataMode().toLowerCase(),
  awsRegion: readEnv("APP_REGION", "us-east-1"),
  appAccessKeyId: readEnv("APP_ACCESS_KEY_ID", ""),
  appSecretAccessKey: readEnv("APP_SECRET_ACCESS_KEY", ""),
  appSessionToken: readEnv("APP_SESSION_TOKEN", ""),
  dynamoTableName: readEnv("DYNAMODB_TABLE_NAME", "Data_Vista_Demanda_Capacidad"),
  dynamoPrimaryKey: readEnv("DYNAMODB_PRIMARY_KEY", "key_mvp"),
  viewsDynamoTableName: readEnv("VIEWS_DYNAMODB_TABLE_NAME", "Vistas_Demanda_Capacidad"),
  viewsDynamoPrimaryKey: readEnv("VIEWS_DYNAMODB_PRIMARY_KEY", "id"),
  refreshLambdaName: readEnv("REFRESH_LAMBDA_NAME", "Reporte_Vista_Capacidad"),
  backendLambdaName: readEnv("BACKEND_LAMBDA_NAME", "Backend_Vista_Capacidad"),
  dataDir,
  mockDataPath: path.join(dataDir, "initiatives.mock.json"),
  localDataPath: path.join(dataDir, "initiatives.local.json"),
  viewsPath: path.join(dataDir, "views.json")
};

// ===== Configuracion manual de campos =====
// Convencion de keys:
// - top:<atributo> para campos raiz del item DynamoDB.
// - mvp:<campo> para campos_mvp.<campo>.
// - iniciativa:<campo> para iniciativa_padre.campos_iniciativa.<campo>.
//
// Para ocultar un campo del selector, agregalo en hiddenFieldKeys.
// Para mostrar SOLO ciertos campos, llena visibleFieldKeys. Si queda vacio,
// se muestran todos los descubiertos salvo los ocultos.
const visibleFieldKeys = [];

const hiddenFieldKeys = [
  // Campos usados internamente para hyperlinks; no se muestran ni se seleccionan.
  "top:url_mvp",
  "top:url_mpv",
  "top:url_iniciativa",
  "top:ulr_iniciativa"
];

// Campos no editables. Tambien puedes sumar con READONLY_FIELDS=key1,key2.
const manualReadonlyFieldKeys = [
  "top:key_mvp",
  "top:key_iniciativa",
  "top:id_mvp",
  "top:id_iniciativa",
  "top:nombre_mvp",
  "top:nombre_iniciativa",
  "top:url_mvp",
  "top:url_iniciativa",
  "top:ultimo_comentario_mvp.comentario",
  "mvp:Evaluación del SRE",
];

// Campos de opcion unica. Ajusta valores a los catalogos reales.
const singleOptionFields = {
  "mvp:Estado": [
    "No Iniciado",
    "ANÁLISIS / REFINAMIENTO",
    "DISEÑO", 
    "DESARROLLO", 
    "DEPLOY QA", 
    "PRUEBAS INTEGRALES", 
    "DEPLOY PRODUCCIÓN", 
    "DEPLOY NACIONAL", 
    "PROCESO DE FIRMAS", 
    "Cierre", 
    "Baja Servicio", 
    "Cancelado", 
    "On Hold"
  ],
  "mvp:Estado del MVP": [
    "No Iniciado",
    "En ejecución",
    "Con impedimentos",
    "Con riesgos",
    "On hold",
    "Cerrado",
    "Cancelado"
  ],
  "mvp:SRE": ["Si", "N/A"],
  "mvp:Líder de Infraestructura": ["Si", "N/A"],
  "mvp:Ingeniero de observabilidad": ["Si", "N/A"],
  "mvp:Consultor Nave": ["Si", "N/A"],
  "mvp:Coordinador NAVE": ["Si", "N/A"],
  "mvp:SRE asignado": [
    "Diana Garza", 
    "David Casas", 
    "Angel de León", 
    "Victoria Hernández", 
    "Luis Moranchel", 
    "Enrique Saldaña", 
    "Saul Reyna", 
    "Jose Arnaldo Perez", 
    "Lucia Ramírez Guerra", 
    "Martha Laura Santana", 
    "Juan Javier Cardona", 
    "Mario Galindo", 
    "Jefte Villanueva Garcia"
  ],
  "mvp:¿Cuenta con Calculadora?": ["Si", "No", "N/A"],
  "mvp:¿Cuenta con T-Shirt?": ["Si", "No", "N/A"],
  "iniciativa:Estado": ["Descubrimiento", "Planeación", "Ejecución", "Cierre", "Pausada", "Cancelada"],
  "iniciativa:Prioridad": ["Highest", "High", "Medium", "Low", "Lowest"],
  "iniciativa:Marco de Trabajo:": ["DevSecOps", "Waterfall", "Ágil", "Híbrido"],
  "iniciativa:Tipo de Iniciativa": ["Nueva", "Mejora", "Operativa", "Regulatoria"]
};

// Campos de opcion multiple. Si dejas options vacio, el portal permite capturar
// valores separados por " | "; si agregas options, renderiza selector multiple.
const multipleOptionFields = {
  "mvp:Champions": [],
  "mvp:Componentes": [],
  "mvp:Etiquetas": [],
  "mvp:Versiones afectadas": [],
  "mvp:Versiones corregidas": [],
  "mvp:Áreas de enfoque": [],
  "iniciativa:Champions": [],
  "iniciativa:Componentes": [],
  "iniciativa:Etiquetas": [],
  "iniciativa:Versiones afectadas": [],
  "iniciativa:Versiones corregidas": [],
  "iniciativa:Áreas de enfoque": []
};

const fieldWidths = {
  "top:key_mvp": 120,
  "top:nombre_mvp": 300,
  "top:key_iniciativa": 135,
  "top:nombre_iniciativa": 260,
  "top:ultimo_comentario_mvp": 145,
  "top:ultimo_comentario_mvp.comentario": 145,
  "top:ultimo_comentario_iniciativa": 145,
  "mvp:Resumen": 240,
  "mvp:Descripción": 220,
  "mvp:Comentario": 220,
  "mvp:Estado": 190,
  "mvp:Estado del MVP": 170,
  "mvp:SRE": 170,
  "mvp:SRE asignado": 190,
  "mvp:Champion": 170,
  "mvp:Champions": 210,
  "mvp:Observaciones MVP": 220,
  "mvp:Observaciones Demanda": 220,
  "mvp:Observaciones de Capacidad": 220,
  "mvp:Impedimentos": 220,
  "mvp:Impedimentos y Dependencias": 220,
  "mvp:Riesgos": 220,
  "mvp:Retos": 220,
  "mvp:Logros": 220,
  "iniciativa:Resumen": 240,
  "iniciativa:Descripción": 220,
  "iniciativa:Comentario": 220,
  "iniciativa:Observaciones Demanda": 220,
  "iniciativa:Observaciones de Capacidad": 220,
  "iniciativa:Portafolio": 180,
  "iniciativa:Journey": 240
};

const defaultViewColumns = [
  "top:key_mvp",
  "top:key_iniciativa",
  "top:nombre_iniciativa",
  "top:nombre_mvp",
  "mvp:Estado",
  "iniciativa:Estado",
  "mvp:Contacto (TPO)",
  "mvp:SRE asignado",
  "mvp:Porcentaje SRE",
  "mvp:Líder de Infraestructura asignado",
  "mvp:Porcentaje Líder de Infraestructura",  
  "mvp:Plataforma impactada",
  "mvp:Champions",
  "mvp:CR / SI",
  "mvp:Journey",
  "mvp:Talla",
  "mvp:Equipo",
  "iniciativa:Folio:",
  "iniciativa:Portafolio",
  "iniciativa:Product Owner",
  "iniciativa:Avenida",
  "mvp:Fecha Asignación SRE",
  "mvp:Fecha Fin planeada MVP",
  "mvp:Fecha inicio MVP",
  "top:ultimo_comentario_mvp",
  "top:ultimo_comentario_iniciativa",
];

const metricFields = {
  sre: "mvp:SRE asignado",
  champion: "mvp:Champions",
  mvpStatus: "mvp:Estado",
  initiativeStatus: "iniciativa:Estado"
};

const topLevelColumns = [
  {
    key: "top:key_mvp",
    label: "Key MVP",
    path: ["key_mvp"],
    linkPath: ["url_mvp"],
    linkPaths: [["url_mvp"], ["url_mpv"], ["ulr_mvp"]],
    width: 120
  },
  { key: "top:nombre_mvp", label: "Nombre MVP", path: ["nombre_mvp"], width: 300 },
  { key: "top:url_mvp", label: "URL MVP", path: ["url_mvp"], width: 240 },
  { key: "top:id_mvp", label: "ID MVP", path: ["id_mvp"], width: 110 },
  {
    key: "top:key_iniciativa",
    label: "Key iniciativa",
    path: ["key_iniciativa"],
    linkPath: ["url_iniciativa"],
    linkPaths: [
      ["url_iniciativa"],
      ["ulr_iniciativa"],
      ["iniciativa_padre", "url_iniciativa"],
      ["iniciativa_padre", "ulr_iniciativa"]
    ],
    width: 135
  },
  { key: "top:nombre_iniciativa", label: "Nombre iniciativa", path: ["nombre_iniciativa"], width: 260 },
  { key: "top:url_iniciativa", label: "URL iniciativa", path: ["url_iniciativa"], width: 240 },
  { key: "top:id_iniciativa", label: "ID iniciativa", path: ["id_iniciativa"], width: 120 },
  { key: "top:tiene_iniciativa_padre", label: "Tiene iniciativa padre", path: ["tiene_iniciativa_padre"], type: "boolean", width: 165 },
  { key: "top:actualizado_en", label: "Actualizado en", path: ["actualizado_en"], type: "date", width: 190 },
  { key: "top:parent_refs", label: "Referencias padre", path: ["parent_refs"], type: "multiselect", width: 180 },
  {
    key: "top:ultimo_comentario_mvp",
    label: "Último comentario MVP",
    path: ["ultimo_comentario_mvp", "comentario"],
    fieldId: "ultimo_comentario_mvp",
    dataType: "comment",
    width: 145
  },
  { key: "top:ultimo_comentario_mvp.comentario", label: "Último comentario MVP", path: ["ultimo_comentario_mvp", "comentario"], fieldId: "ultimo_comentario_mvp", dataType: "comment", width: 145 },
  { key: "top:ultimo_comentario_mvp.autor", label: "Autor último comentario MVP", path: ["ultimo_comentario_mvp", "autor"], width: 220 },
  {
    key: "top:ultimo_comentario_iniciativa",
    label: "Último comentario iniciativa",
    path: ["iniciativa_padre", "ultimo_comentario_iniciativa", "comentario"],
    fieldId: "ultimo_comentario_iniciativa",
    dataType: "comment",
    width: 145
  }
];

const fallbackMvpFields = [
  "Resumen",
  "Estado",
  "Estado del MVP",
  "Categoría de estado",
  "Prioridad",
  "SRE",
  "SRE asignado",
  "Champion",
  "Champions",
  "Persona asignada",
  "Product Owner",
  "Portafolio",
  "Journey",
  "Proyecto",
  "Tipo de Capacidad",
  "Tipo de Iniciativa",
  "Tipo de Infraestructura",
  "Tipo de Monitoreo",
  "Tipo de Servicio",
  "Total de MVPs",
  "T Shirt",
  "Talla",
  "¿Cuenta con Calculadora?",
  "¿Cuenta con T-Shirt?",
  "Observaciones MVP",
  "Observaciones Demanda",
  "Observaciones de Capacidad",
  "Impedimentos",
  "Impedimentos y Dependencias",
  "Riesgos",
  "Retos",
  "Logros",
  "Comentario",
  "Descripción",
  "Creada",
  "Actualizada",
  "Fecha inicio MVP",
  "Fecha Fin planeada MVP",
  "Fecha Fin Real",
  "Fecha de vencimiento",
  "Fecha OnHold",
  "Fecha Cancelación",
  "Monto",
  "Presupuesto T Shirt",
  "Presupuesto Calculadora",
  "Etiquetas",
  "Componentes"
];

const fallbackInitiativeFields = [
  "Resumen",
  "Estado",
  "Categoría de estado",
  "Prioridad",
  "Champion",
  "Champions",
  "SRE",
  "SRE asignado",
  "Product Owner",
  "Portafolio",
  "Journey",
  "Marco de Trabajo:",
  "Folio:",
  "Proyecto",
  "Tipo de Iniciativa",
  "Total de MVPs",
  "Observaciones Demanda",
  "Observaciones de Capacidad",
  "Comentario",
  "Descripción",
  "Creada",
  "Actualizada",
  "Fecha inicio Ideación",
  "Fecha final Ideación",
  "Fecha inicio Alineación",
  "Fecha final Alineación",
  "Fecha inicio MVP",
  "Fecha Fin planeada MVP",
  "Fecha Fin Real",
  "Monto",
  "Presupuesto T Shirt",
  "Presupuesto Calculadora",
  "Etiquetas",
  "Componentes"
];

const readonlyFields = Array.from(new Set([
  ...manualReadonlyFieldKeys,
  ...listFromEnv("READONLY_FIELDS", [])
]));

const readonlyDataTypes = new Set(["no editable"]);
const singleOptionDataTypes = new Set(["option", "option-with-child", "option2"]);
const multipleOptionDataTypes = new Set(["array"]);

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

function getNestedValue(item, pathSegments) {
  return pathSegments.reduce((value, segment) => {
    if (value === null || value === undefined) return undefined;
    return value[segment];
  }, item);
}

function setNestedValue(item, pathSegments, value) {
  let cursor = item;
  pathSegments.slice(0, -1).forEach((segment) => {
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
  const finalSegment = pathSegments[pathSegments.length - 1];
  const current = cursor[finalSegment];
  if (isFieldEnvelope(current)) {
    current.valor = value;
  } else {
    cursor[finalSegment] = value;
  }
}

function collectFieldMetadata(items, pathSegments, fieldName) {
  const options = new Set();
  let fieldId = "";
  let dataType = "";
  let wrapped = false;

  items.forEach((item) => {
    const value = getNestedValue(item, [...pathSegments, fieldName]);
    if (!isFieldEnvelope(value)) return;

    wrapped = true;
    if (!fieldId && value.id) fieldId = value.id;
    if (!dataType && value.tipo_dato) dataType = value.tipo_dato;
    if (Array.isArray(value.opciones)) {
      value.opciones.forEach((option) => {
        if (option !== null && option !== undefined) options.add(String(option));
      });
    }
  });

  return {
    fieldId,
    dataType,
    wrapped,
    options: Array.from(options).sort((a, b) => a.localeCompare(b, "es"))
  };
}

function discoverFieldNames(items, pathSegments, fallbackFields) {
  const names = new Set(fallbackFields);
  items.forEach((item) => {
    const value = getNestedValue(item, pathSegments);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.keys(value).forEach((key) => names.add(key));
    }
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
}

function inferType(fieldName, key, metadata = {}) {
  const normalizedDataType = String(metadata.dataType || "").trim().toLowerCase();
  if (multipleOptionDataTypes.has(normalizedDataType)) return "multiselect";
  if (singleOptionDataTypes.has(normalizedDataType)) return "select";
  if (singleOptionFields[key]) return "select";
  if (multipleOptionFields[key]) return "multiselect";

  const normalized = fieldName.toLowerCase();
  if (
    normalized.includes("fecha") ||
    normalized.includes("date") ||
    normalized.includes("creada") ||
    normalized.includes("actualizada") ||
    normalized.includes("resuelta")
  ) {
    return "date";
  }

  if (
    normalized.includes("%") ||
    normalized.includes("porcentaje") ||
    normalized.includes("monto") ||
    normalized.includes("total") ||
    normalized.includes("estimación") ||
    normalized.includes("estimado")
  ) {
    return "number";
  }

  return "text";
}

function inferWidth(fieldName, key) {
  if (fieldWidths[key]) return fieldWidths[key];

  const normalized = fieldName.toLowerCase();
  const longTextTokens = [
    "comentario",
    "descripción",
    "descripcion",
    "observaciones",
    "impedimentos",
    "dependencias",
    "riesgos",
    "retos",
    "logros"
  ];

  return longTextTokens.some((token) => normalized.includes(token)) ? 220 : 170;
}

function createMapColumn(scope, fieldName) {
  return createMapColumnFromMetadata(scope, fieldName);
}

function createMapColumnFromMetadata(scope, fieldName, metadata = {}) {
  const key = `${scope}:${fieldName}`;
  const isMvp = scope === "mvp";
  const basePath = isMvp
    ? ["campos_mvp", fieldName]
    : ["iniciativa_padre", "campos_iniciativa", fieldName];
  const dataType = String(metadata.dataType || "").trim();
  const isReadonlyDataType = readonlyDataTypes.has(dataType.toLowerCase());
  const dataOptions = metadata.options?.length ? metadata.options : null;

  return {
    key,
    label: `${isMvp ? "MVP" : "Iniciativa"} · ${fieldName}`,
    scope,
    fieldName,
    path: metadata.wrapped ? [...basePath, "valor"] : basePath,
    metaPath: basePath,
    fieldId: metadata.fieldId || "",
    dataType,
    type: inferType(fieldName, key, metadata),
    options: dataOptions || singleOptionFields[key] || multipleOptionFields[key] || [],
    readonly: readonlyFields.includes(key) || isReadonlyDataType,
    hidden: hiddenFieldKeys.includes(key),
    width: inferWidth(fieldName, key)
  };
}

function decorateColumn(column) {
  return {
    type: "text",
    options: [],
    readonly: readonlyFields.includes(column.key),
    hidden: hiddenFieldKeys.includes(column.key),
    width: fieldWidths[column.key] || column.width || 170,
    ...column
  };
}

function isVisibleColumn(column) {
  if (visibleFieldKeys.length) return visibleFieldKeys.includes(column.key);
  return !column.hidden;
}

function buildColumnDefinitions(items = []) {
  const topColumns = topLevelColumns.map(decorateColumn);
  const mvpColumns = discoverFieldNames(items, ["campos_mvp"], fallbackMvpFields)
    .map((fieldName) => createMapColumnFromMetadata(
      "mvp",
      fieldName,
      collectFieldMetadata(items, ["campos_mvp"], fieldName)
    ));
  const initiativeColumns = discoverFieldNames(items, ["iniciativa_padre", "campos_iniciativa"], fallbackInitiativeFields)
    .map((fieldName) => createMapColumnFromMetadata(
      "iniciativa",
      fieldName,
      collectFieldMetadata(items, ["iniciativa_padre", "campos_iniciativa"], fieldName)
    ));
  const visibleColumns = visibleFieldKeys
    .map((key) => getColumnDefinition(key))
    .filter(Boolean);

  const byKey = new Map();
  [...topColumns, ...mvpColumns, ...initiativeColumns, ...visibleColumns].forEach((column) => {
    byKey.set(column.key, column);
  });

  return Array.from(byKey.values()).filter(isVisibleColumn);
}

function getColumnDefinition(key) {
  const topColumn = topLevelColumns.find((column) => column.key === key);
  if (topColumn) return decorateColumn(topColumn);

  if (key.startsWith("mvp:")) {
    return createMapColumn("mvp", key.slice(4));
  }

  if (key.startsWith("iniciativa:")) {
    return createMapColumn("iniciativa", key.slice("iniciativa:".length));
  }

  return null;
}

function isKnownColumnKey(key) {
  const definition = getColumnDefinition(key);
  return Boolean(definition && !definition.hidden);
}

module.exports = {
  config,
  buildColumnDefinitions,
  defaultViewColumns,
  getColumnDefinition,
  getNestedValue,
  isFieldEnvelope,
  isKnownColumnKey,
  metricFields,
  readonlyFields,
  setNestedValue,
  unwrapFieldValue
};
