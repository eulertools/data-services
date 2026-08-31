import {App, aws_elasticache as elasticache, Fn, Stack, StackProps} from 'aws-cdk-lib';
import {EcrEcsPipeline} from '../constructs/ecr-ecs-pipeline/ecr-ecs-pipeline-construct';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface AppStackProps extends StackProps {
  hostedZone: string;
}

export class AppSubscriptionsServiceStack extends Stack {
  constructor(scope: App, id: string, props?: AppStackProps) {
    super(scope, id, props);

    const { hostedZone } = props!;

    const repositoryName = Fn.importValue('data-services-repository');

    const repository = ecr.Repository.fromRepositoryName(this, 'data-services-repository', repositoryName);

    const bucketName = Fn.importValue('artifact-bucket');

    const bucket = s3.Bucket.fromBucketName(this, 's3-bucket', bucketName);

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      isDefault: false
    });

    const cluster = ecs.Cluster.fromClusterAttributes(this, 'data-services-cluster', {
      vpc,
      clusterName: 'main',
      securityGroups: []
    });

    const clusterSecurityGroup = new ec2.SecurityGroup(this, `cluster-sg-access`, {
      vpc,
      description: 'Allows traffic to the cluster',
      allowAllOutbound: true
    });

    clusterSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(6379), 'allow http rpc access from the world');

    const subnetGroup = new elasticache.CfnSubnetGroup(this, `data-services-subnet-group`, {
      description: `List of subnets used for redis cache`,
      subnetIds: vpc.privateSubnets.map(function (subnet) {
        return subnet.subnetId;
      })
    });

    const redis = new elasticache.CfnCacheCluster(this, 'RedisCache', {
      clusterName: 'data-services-redis',
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      numCacheNodes: 1,
      autoMinorVersionUpgrade: true,
      cacheSubnetGroupName: subnetGroup.ref,
      vpcSecurityGroupIds: [clusterSecurityGroup.securityGroupId]
    });

    redis.addDependsOn(subnetGroup);

    const executionRole = new iam.Role(this, 'task-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'data-services-task-role',
      description: 'Role that the task definitions for data-services'
    });

    executionRole.attachInlinePolicy(
      new iam.Policy(this, 'data-services-task-policy', {
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

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'DataServicesTaskDef', {
      cpu: 1024,
      memoryLimitMiB: 4096,
      family: `data-services`,
      taskRole: executionRole
    });

    const sentryDSN = secretsmanager.Secret.fromSecretNameV2(this, 'sentryDSN', 'sentryDSN');

    const container = taskDefinition.addContainer('data-services', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      environment: {
        DSN_URL: sentryDSN.secretValue.toString(),
        REDIS_ENDPOINT: redis.attrRedisEndpointAddress,
        POOLS_NODE: `https://bsc.nodes.prod.euler.tools/rpc`,
        AWS_COGNITO_IDENTITY_POOL_ID: 'us-east-1_vpHOnQIGV',
        DEBUG: '*,-express:*,-body-parser:*,-sqs-consumer,-compression,-@feathersjs/express*,-send,-winston:create-logger*,-axm:*,-follow-redirects,-require-in-the-middle,-engine:*,-@feathersjs/transport-commons*,-socket.io*,-@feathersjs/configuration',
        AWS_REGION: 'us-east-1',
        NODE_ENV: 'development',
        POSTGRES_PASSWORD: 'english-fruition-amber-describe',
        REDIS_PORT: "6379",
      },
      logging: ecs.LogDriver.awsLogs({streamPrefix: 'dataServicesClient'}),
      portMappings: [{containerPort: 80, hostPort: 80, protocol: ecs.Protocol.TCP}, {
        containerPort: 3030,
        hostPort: 3030,
        protocol: ecs.Protocol.TCP
      }]
    });

    const ecsSG = new ec2.SecurityGroup(this, `service-sg`, {
      vpc,
      description: 'Allows traffic to the node ports of the nginx container',
      allowAllOutbound: true
    });

    ecsSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'allow http rpc access from the world');

    clusterSecurityGroup.connections.allowFrom(ecsSG, ec2.Port.tcp(2049), 'Allows access to cluster security group')

    const service = new ecs.FargateService(this, 'data-services', {
      cluster,
      desiredCount: 1,
      taskDefinition,
      securityGroups: [ecsSG],
      assignPublicIp: true
    });

    const pipeline = new EcrEcsPipeline(this, 'DataServicesCodePipeline', {
      service: service,
      repository: repository,
      containerName: container.containerName,
      artifactBucket: bucket
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'data-services',
      securityGroup: ecsSG
    });

    const privZone = route53.HostedZone.fromLookup(this, 'PrivateHostedZone', {
      privateZone: true,
      domainName: hostedZone
    });

    const publicZone = route53.HostedZone.fromLookup(this, 'PublicHostedZone', {
      privateZone: false,
      domainName: hostedZone
    });

    const certificate = new certificatemanager.Certificate(this, 'DataServicesCertificate', {
      domainName: hostedZone,
      subjectAlternativeNames: [`data-services.${hostedZone}`],
      validation: certificatemanager.CertificateValidation.fromDns(publicZone)
    });

    const listener = lb.addListener('DataServicesListener', {
      port: 443,
      certificates: [certificate]
    });

    lb.addRedirect();

    const targetGroup = listener.addTargets('DataServices', {
      targetGroupName: 'data-services',
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: container.containerName,
          containerPort: 3030
        })
      ]
    });

    new route53.ARecord(this, 'DataServicesPrivateAliasRecord', {
      zone: privZone,
      recordName: 'data-services',
      target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(lb))
    });

    new route53.ARecord(this, 'DataServicesPublicAliasRecord', {
      zone: publicZone,
      recordName: 'data-services',
      target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(lb))
    });
  }
}
