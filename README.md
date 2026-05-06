# Vista Capacidades

Portal Next.js 15 + React 19 para administrar vistas tipo Excel sobre iniciativas y MVPs almacenados en DynamoDB.

## Desarrollo local

Usa Node.js 22.

```bash
npm install
npm run dev
```

En Windows PowerShell, si `npm` queda bloqueado por la politica de scripts, usa:

```powershell
npm.cmd run dev
```

El portal queda disponible en `http://localhost:3000`, o en el puerto libre que indique Next.js.

## Build

```bash
npm run build
npm start
```

Los scripts invocan Next.js directamente con `node ./node_modules/next/dist/bin/next` para evitar problemas con rutas de OneDrive que contienen `&`.

## Variables para Amplify

Configura estas variables en Amplify > Hosting > Environment variables:

```env
DATA_MODE=aws
APP_REGION=us-east-1
DYNAMODB_TABLE_NAME=Data_Vista_Demanda_Capacidad
DYNAMODB_PRIMARY_KEY=key_mvp
VIEWS_DYNAMODB_TABLE_NAME=Vistas_Demanda_Capacidad
VIEWS_DYNAMODB_PRIMARY_KEY=id
REFRESH_LAMBDA_NAME=Reporte_Vista_Capacidad
BACKEND_LAMBDA_NAME=Backend_Vista_Capacidad
```

Recomendado: usar un Service Role de Amplify con permisos a DynamoDB y Lambda. Si necesitas access keys temporalmente, usa `APP_ACCESS_KEY_ID`, `APP_SECRET_ACCESS_KEY` y `APP_SESSION_TOKEN`. No subas `.env.local`.

Nota para Next.js SSR en Amplify: las variables de la consola se exponen al build, pero no siempre al runtime de Next.js. Por eso `amplify.yml` copia las variables necesarias a `.env.production` antes de compilar. Evita usar access keys permanentes cuando puedas; es preferible un rol IAM con permisos minimos.

## Estructura

- `app/page.js`: renderiza la UI existente desde `public/index.html`.
- `app/api/[[...path]]/route.js`: expone las rutas API usadas por `public/app.js`.
- `src/`: contiene configuracion, acceso a DynamoDB/Lambda, vistas y exportacion.
- `public/`: contiene la UI tipo Excel actual.
- `data/initiatives.mock.json`: datos demo sanitizados para `DATA_MODE=mock`.

## Amplify

El archivo `amplify.yml` usa Node 22, instala con `npm ci` y publica `.next`.

Al conectar este repo en Amplify:

1. Selecciona la rama `main`.
2. Configura las variables de entorno anteriores.
3. Configura el Service Role con permisos para leer/escribir las tablas DynamoDB e invocar las Lambdas.
4. Ejecuta el deploy.
