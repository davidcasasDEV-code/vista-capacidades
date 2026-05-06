# Vista Capacidades — Next.js 15 + React 19 + Node.js 22

Este paquete migra el proyecto original de `server.js` a Next.js App Router para poder publicarlo en AWS Amplify con SSR/API routes.

## Comandos

```bash
npm install
npm run dev
npm run build
npm start
```

## Variables de entorno requeridas en Amplify

Configura estas variables en Amplify > Hosting > Environment variables:

```env
DATA_MODE=aws
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=Data_Vista_Demanda_Capacidad
DYNAMODB_PRIMARY_KEY=key_mvp
VIEWS_DYNAMODB_TABLE_NAME=Vistas_Demanda_Capacidad
VIEWS_DYNAMODB_PRIMARY_KEY=id
REFRESH_LAMBDA_NAME=Reporte_Vista_Capacidad
BACKEND_LAMBDA_NAME=Backend_Vista_Capacidad
```

Para credenciales AWS, lo más seguro es usar un Service Role de Amplify con permisos a DynamoDB/Lambda. Si necesitas usar access keys temporalmente, agrégalas como variables de entorno en Amplify, no dentro del ZIP.

## Estructura

- `app/page.js`: Renderiza la UI existente desde `public/index.html`.
- `app/api/[[...path]]/route.js`: Reemplaza las rutas del `server.js` original.
- `src/`: Conserva la lógica original de configuración, DynamoDB, vistas y exportación.
- `data/`: Conserva tus JSON locales/mock.
- `public/app.js` y `public/styles.css`: Conservan la funcionalidad y estilos actuales.
