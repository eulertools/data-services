import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {App, CfnOutput, Stack, StackProps} from "aws-cdk-lib";

export class ECSStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const defaultVPC = ec2.Vpc.fromLookup(this, 'defaultVPC', {
      isDefault: false,
    });

    const cluster = new ecs.Cluster(this, "data-services-cluster", {
      vpc: defaultVPC,
      clusterName: "data-services"
    });

    new CfnOutput(this, 'data-services', {
      value: cluster.clusterName,
      exportName: 'data-services-cluster'
    });
  }
}
