import * as ecr from 'aws-cdk-lib/aws-ecr';
import { App, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';

export class ECRStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const repository = new ecr.Repository(this, 'ds-marketplace-repository', {
      repositoryName: 'ds-marketplace',
      removalPolicy: RemovalPolicy.DESTROY
    });
    repository.addLifecycleRule({ tagPrefixList: ['prod'], maxImageCount: 60 });
    repository.addLifecycleRule({ maxImageAge: Duration.days(30) });

    new CfnOutput(this, 'ds-marketplace-repo', {
      value: repository.repositoryName,
      exportName: 'ds-marketplace-repository'
    });
  }
}
