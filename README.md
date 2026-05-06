# Vista Capacidades

Portal Node.js para administrar vistas tipo Excel sobre iniciativas/capacidades. El MVP permite crear vistas, seleccionar columnas de DynamoDB, filtrar, editar celdas anidadas en borrador, guardar cambios, descargar la vista como archivo compatible con Excel e invocar un refresco de informacion.

## Arranque local

```bash
npm start
```

Abre `http://localhost:3000`.

Por defecto corre en `DATA_MODE=mock`, usando datos locales en `data/initiatives.local.json`. El primer arranque copia `data/initiatives.mock.json`.

## Configuracion AWS

1. Copia `.env.example` a `.env`.
2. Llena `APP_REGION`, credenciales, `DYNAMODB_TABLE_NAME`, `DYNAMODB_PRIMARY_KEY`, `VIEWS_DYNAMODB_TABLE_NAME`, `REFRESH_LAMBDA_NAME` y `BACKEND_LAMBDA_NAME`.
3. Instala dependencias opcionales:

```bash
npm install
```

4. Ejecuta con `DATA_MODE=aws`.

```bash
DATA_MODE=aws npm start
```

En Windows PowerShell:

```powershell
$env:DATA_MODE="aws"
npm start
```

## Donde ajustar campos

Edita [src/config.js](./src/config.js). Las columnas usan esta convencion:

- `top:<atributo>` para campos raiz del item DynamoDB, por ejemplo `top:key_mvp`.
- `mvp:<campo>` para `campos_mvp.<campo>`, por ejemplo `mvp:Estado del MVP`.
- `iniciativa:<campo>` para `iniciativa_padre.campos_iniciativa.<campo>`, por ejemplo `iniciativa:Portafolio`.

- `visibleFieldKeys`: si lo llenas, solo esos campos aparecen en el selector.
- `hiddenFieldKeys`: campos que no aparecen en el selector.
- `manualReadonlyFieldKeys`: campos no editables desde el portal.
- `singleOptionFields`: campos de seleccion unica y sus opciones.
- `multipleOptionFields`: campos de seleccion multiple. Si dejas opciones vacias, captura valores separados por ` | `.
- `defaultViewColumns`: columnas de la vista inicial.
- `metricFields`: campos usados por los widgets superiores.
- `DYNAMODB_PRIMARY_KEY`: atributo usado como llave primaria para actualizar una fila.
- `VIEWS_DYNAMODB_TABLE_NAME`: tabla DynamoDB donde se guardan las vistas. Por defecto usa `Vistas_Demanda_Capacidad`.
- `REFRESH_LAMBDA_NAME`: Lambda del boton `Actualizar info`. Por defecto usa `Reporte_Vista_Capacidad`.
- `BACKEND_LAMBDA_NAME`: Lambda ejecutada despues de guardar cambios de filas. Por defecto usa `Backend_Vista_Capacidad`.

El portal descubre tambien campos presentes en `campos_mvp` e `iniciativa_padre.campos_iniciativa` al cargar datos, por lo que si tu Lambda agrega nuevos campos, apareceran salvo que los ocultes o uses `visibleFieldKeys`.

## Endpoints principales

- `GET /api/initiatives`: obtiene iniciativas.
- `POST /api/refresh`: invoca `Reporte_Vista_Capacidad` sin payload y despues vuelve a leer iniciativas.
- `GET /api/views`: lista vistas guardadas.
- `POST /api/views`: crea vista.
- `PUT /api/views/:id`: actualiza vista.
- `POST /api/views/:id/save`: guarda configuracion de vista, campos editados por `key_mvp` e invoca `Backend_Vista_Capacidad` por cada fila modificada.
- `DELETE /api/views/:id`: elimina una vista guardada.
- `GET /api/views/:id/export`: descarga archivo `.xls` compatible con Excel.

## Notas de implementacion

- No hay login porque el portal queda preparado para un solo administrador.
- En `DATA_MODE=aws`, las vistas se guardan en DynamoDB con id string unico; los nombres pueden repetirse. El item guarda `columns` y `configuracion.camposSeleccionados` / `configuracion.ordenColumnas` para cargar la vista despues.
- Editar una celda no llama AWS inmediatamente: el cambio queda pendiente hasta presionar `Guardar vista`, cambiar de vista aceptando guardar o actualizar aceptando guardar.
- En `DATA_MODE=aws`, `Guardar vista` actualiza la ruta anidada de DynamoDB en `Data_Vista_Demanda_Capacidad`, por ejemplo `campos_mvp.Estado`, y luego invoca `Backend_Vista_Capacidad` con `{ key, campos_modificados }`.
- Al cargar la pagina o presionar `Actualizar info`, el portal invoca `Reporte_Vista_Capacidad` sin payload, espera respuesta y luego lee `Data_Vista_Demanda_Capacidad`; los datos se muestran cuando termina ese flujo. Cambiar de vista ya no ejecuta este refresco.
- La tabla pagina los resultados en bloques de 20 filas y muestra controles arriba y abajo.
- Los filtros superiores de `SRE asignado`, `Champions` y `Estatus de MVP` aceptan varios valores y se guardan en la configuracion de la vista. `Estatus de MVP` usa el campo `mvp:Estado`. Los filtros dentro de cada columna son solo busqueda rapida temporal.
- Los textos largos se abren en un modal para lectura y edicion. `Ultimo comentario MVP` e `iniciativa:Comentario` son de lectura directa; desde ahi se puede preparar un nuevo comentario para MVP o Iniciativa y se guarda junto con los demas cambios pendientes.
- El orden de columnas se puede cambiar arrastrando encabezados; el nuevo orden se guarda en la configuracion de la vista.
- El diseno prioriza trabajo operativo: widgets superiores, panel de vistas y tabla editable tipo hoja de calculo.
- La descarga se genera como HTML Excel (`.xls`) para evitar dependencias externas; Excel lo abre directamente.
- Para produccion conviene servirlo detras de HTTPS y mover credenciales a variables de entorno o secretos del ambiente, no al codigo.
