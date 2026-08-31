import { App, Duration, Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_rds as rds } from 'aws-cdk-lib'; 'aws-cdk-lib/aws-rds';

export class AppSubscriptionsServiceRDSStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
      super(scope, id, props);

      const vpc = ec2.Vpc.fromLookup(this, 'defaultVpc', {
        isDefault: false
      });

      const dbInstance = new rds.DatabaseInstance(this, 'DataServicesDBInstance', {
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_13_1,
        }),
        availabilityZone: 'us-east-1c',
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE4_GRAVITON,
          ec2.InstanceSize.MEDIUM
        ),
        instanceIdentifier: 'DataServiceDB',
        credentials: rds.Credentials.fromGeneratedSecret('postgres'),
        multiAz: false,
        allocatedStorage: 100,
        maxAllocatedStorage: 105,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        backupRetention: Duration.days(0),
        deleteAutomatedBackups: true,
        removalPolicy: RemovalPolicy.DESTROY,
        deletionProtection: false,
        databaseName: 'subscriptionsdb',
        publiclyAccessible: true,
      });
  
      dbInstance.connections.allowFromAnyIpv4(ec2.Port.tcp(5432));

      new CfnOutput(this, 'dbEndpoint', {
        value: dbInstance.instanceEndpoint.hostname,
      });
  
      new CfnOutput(this, 'secretName', {
        value: dbInstance.secret?.secretName!,
      });
    }
}
