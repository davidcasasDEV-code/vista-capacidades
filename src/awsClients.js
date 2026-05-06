const { config } = require("./config");

function loadAwsSdk() {
  try {
    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
    const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

    return {
      DynamoDBClient,
      DynamoDBDocumentClient,
      DeleteCommand,
      GetCommand,
      PutCommand,
      ScanCommand,
      UpdateCommand,
      LambdaClient,
      InvokeCommand
    };
  } catch (error) {
    const friendly = new Error(
      "Faltan dependencias AWS SDK. Ejecuta `npm install` y configura .env antes de usar DATA_MODE=aws."
    );
    friendly.cause = error;
    throw friendly;
  }
}

function createClients() {
  const sdk = loadAwsSdk();
  const clientOptions = { region: config.awsRegion };

  // Amplify no permite variables con prefijo AWS_.
  // Si APP_ACCESS_KEY_ID y APP_SECRET_ACCESS_KEY existen, las usamos explícitamente.
  // Si no existen, el SDK usará el IAM Role/Service Role disponible en el runtime.
  if (config.appAccessKeyId && config.appSecretAccessKey) {
    clientOptions.credentials = {
      accessKeyId: config.appAccessKeyId,
      secretAccessKey: config.appSecretAccessKey,
      ...(config.appSessionToken ? { sessionToken: config.appSessionToken } : {})
    };
  }

  const dynamoClient = new sdk.DynamoDBClient(clientOptions);
  const docClient = sdk.DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
  const lambdaClient = new sdk.LambdaClient(clientOptions);

  return {
    ...sdk,
    docClient,
    lambdaClient
  };
}

module.exports = {
  createClients
};
