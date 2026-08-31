import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Cors, LambdaIntegration, RestApi, CognitoUserPoolsAuthorizer, AuthorizationType } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class AppUploadServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const userPoolId = Fn.importValue('user-pool-id');

    const userPool = cognito.UserPool.fromUserPoolId(this, 'cognito-user-pool', userPoolId);

    const fileUploadsBucket = new s3.Bucket(this, 'file-uploads-bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fileUploadsTable = new dynamodb.Table(this, 'file-uploads-table', {
      partitionKey: {
        name: 'identifier',
        type: dynamodb.AttributeType.STRING,
      },
      tableName: 'file-uploads',
      billingMode: dynamodb.BillingMode.PROVISIONED,
    });

    const uploadFileLambda = new lambda.Function(this, 'upload-file-handler', {
      handler: 'index.handler',
      description: 'Create lambda to upload file to dynamodb',
      code: lambda.Code.fromAsset(path.join(__dirname, `/../../src/app-file-uploader-handler`)),
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: Duration.minutes(1),
      environment: {
        FILE_UPLOADS_TABLE: fileUploadsTable.tableName,
        BUCKET_NAME: fileUploadsBucket.bucketName,
      },
    });

    fileUploadsBucket.grantReadWrite(uploadFileLambda);

    fileUploadsTable.grantReadWriteData(uploadFileLambda);

    const restApi = new RestApi(this, `app-file-uploads-url`, {
      deployOptions: {
        stageName: process.env.ENV,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: Cors.ALL_ORIGINS,
      },
      binaryMediaTypes: ['image/*', 'multipart/form-data', '*/*'],
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'api-gateway-cognito-authorizer', {
        cognitoUserPools: [userPool],
        authorizerName: 'cognito-authorizer',
        identitySource: 'method.request.header.Authorization',
      }
    );

    const uploadFile = restApi.root.addResource('user-file');

    uploadFile.addMethod('GET', new LambdaIntegration(uploadFileLambda), {
      authorizer: authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    uploadFile.addMethod('POST', new LambdaIntegration(uploadFileLambda), {
      authorizer: authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    new CfnOutput(this, 'file-upload-table', {
      value: fileUploadsTable.tableName,
    });

    new CfnOutput(this, 'upload-file-url-endpoint', {
      value: `${restApi.url}user-file`,
    });
  }
}
