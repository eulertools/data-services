import * as ecr from 'aws-cdk-lib/aws-ecr';
import { App, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';

export class ECRStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const repository = new ecr.Repository(this, 'data-services-repository', {
      repositoryName: 'data-services',
      removalPolicy: RemovalPolicy.DESTROY
    });
    repository.addLifecycleRule({ tagPrefixList: ['prod'], maxImageCount: 60 });
    repository.addLifecycleRule({ maxImageAge: Duration.days(30) });

    new CfnOutput(this, 'data-services-repo', {
      value: repository.repositoryName,
      exportName: 'data-services-repository'
    });
  }
}
