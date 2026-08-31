import {App, Fn, Stack, StackProps} from 'aws-cdk-lib';
import {EcrEcsPipeline} from '../constructs/ecr-ecs-pipeline/ecr-ecs-pipeline-construct';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class AppMarketPlacePipelineStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const repositoryName = Fn.importValue('ds-marketplace-repository');

    const repository = ecr.Repository.fromRepositoryName(this, 'ds-marketplace-repository', repositoryName);

    const clusterName = Fn.importValue('ds-marketplace-services-cluster');

    const bucketName = Fn.importValue('artifact-bucket');

    const bucket = s3.Bucket.fromBucketName(this, 's3-bucket', bucketName);

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      isDefault: false
    });

    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ds-marketplace-cluster', {
      vpc,
      clusterName: clusterName,
      securityGroups: []
    });

    const executionRole = new iam.Role(this, 'ds-marketplace-task-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'ds-marketplace-task-role',
      description: 'Role that the task definitions for data-services'
    });

    executionRole.attachInlinePolicy(
      new iam.Policy(this, 'ds-marketplace-task-policy', {
        statements: [
          // policies to allow access to other AWS services from within the container e.g SES (Simple Email Service)
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['kinesis:*', 'logs:*', 'ecr:*', 'iam:*', 'dynamodb:*'],
            resources: ['*']
          })
        ]
      })
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'DSMarketPlaceTaskDef', {
      cpu: 1024,
      memoryLimitMiB: 4096,
      family: `data-services`,
      taskRole: executionRole
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(this, 'sentryDSN', 'sentryDSN');

    const container = taskDefinition.addContainer('ds-marketplace', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        NETWORK_RPC: 'wss://bsc-rpc.publicnode.com',
        MARKETPLACE_ADDRESS: '0x89c7a3fcd89fc3b80da5b0629f0a644480117f35',
        TOKEN_INFO_ADDRESS: '0x0e3cd8d5c389967182e07c444b4c309247aaf392',
        BLOCKCHAIN_NAME: 'bsc',
        AWS_REGION: 'us-east-1',
        NODE_ENV: 'development',
      },
      logging: ecs.LogDriver.awsLogs({streamPrefix: 'dsMarketplaceClient'}),
      portMappings: [{containerPort: 80, hostPort: 80, protocol: ecs.Protocol.TCP}, {
        containerPort: 3030,
        hostPort: 3030,
        protocol: ecs.Protocol.TCP
      }]
    });

    const ecsSG = new ec2.SecurityGroup(this, `ds-marketplace-service-sg`, {
      vpc,
      description: 'Allows traffic to the node ports of the nginx container',
      allowAllOutbound: true
    });

    const service = new ecs.FargateService(this, 'ds-marketplace-service', {
      cluster,
      desiredCount: 1,
      taskDefinition,
      securityGroups: [ecsSG],
      assignPublicIp: true
    });

    const pipeline = new EcrEcsPipeline(this, 'DSMarketPlaceCodePipeline', {
      service: service,
      repository: repository,
      containerName: container.containerName,
      artifactBucket: bucket
    });
  }
}
