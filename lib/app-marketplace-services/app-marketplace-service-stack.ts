import {CfnResource, Duration, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as opensearchservice from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import {DynamoEventSource} from "aws-cdk-lib/aws-lambda-event-sources";

export class AppMarketplaceServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "DefaultVPC", { isDefault: false });

    new CfnResource(this, "es-service-linked-role", {
      type: "AWS::IAM::ServiceLinkedRole",
      properties: {
        AWSServiceName: "es.amazonaws.com",
        Description: "Role for ES to access resources in my VPC",
      },
    });

    const table = new dynamodb.Table(this, "marketplace-database", {
      partitionKey: {
        name: "identifier",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "blockchain",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: "marketplace",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const apiCreds = secretsmanager.Secret.fromSecretNameV2(
      this,
      "opensearchMasterUser",
      "esMasterPassword"
    );

    const OSPassword = apiCreds.secretValueFromJson("password").toString();

    const OSDomain = opensearchservice.Domain.fromDomainEndpoint(this, 'opensearch-domain', 'https://vpc-catalog.REGION.es.amazonaws.com')

    const servicesSecGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "ServicesSG",
      'SECURITY_GROUP_ID'
    );

    const syncFunction = new lambda.Function(this, "catalog-dynamodb-syncer", {
      functionName: "marketplace-opensearch-syncer",
      handler: "index.handler",
      description: "Syncs DynamoDB Marketplace with OpenSearch",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../src/opensearch-syncer")),
      vpc,
      securityGroups: [servicesSecGroup],
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: Duration.minutes(1),
      memorySize: 3096,
      environment: {
        ES_DOMAIN: OSDomain.domainEndpoint,
        ES_INDEX: "marketplace_v1",
        PK: "identifier"
      },
    });

    syncFunction.addEventSource(
      new DynamoEventSource(table, {
        batchSize: 25,
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        maxRecordAge: Duration.minutes(60),
        retryAttempts: 2,
        bisectBatchOnError: true,
      })
    );

    OSDomain.grantReadWrite(syncFunction);

    syncFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["es:*"],
        resources: ["*"],
      })
    );
  }
}
