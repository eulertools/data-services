#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppSubscriptionsServiceStack } from '../lib/app-subscriptions-services/app-subscriptions-service-stack';
import { ECRStack } from '../lib/app-subscriptions-services/ecr-stack';
import { ECSStack } from '../lib/app-subscriptions-services/ecs-stack';
import { AppSubscriptionsServiceRDSStack } from '../lib/app-subscriptions-services/app-subscriptions-service-rds-stack';

const app = new cdk.App();

new ECRStack(app, 'data-services-repository', {
  description: 'ECR Repositories for the data-services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new ECSStack(app, 'data-services-cluster', {
  description: 'Setups ECS Clusters for the data-services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new AppSubscriptionsServiceStack(app, 'app-subscriptions-service-stack', {
  hostedZone: 'dev.euler.tools',
  description: 'Setup ECS Stack and pipeline for the data services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});

new AppSubscriptionsServiceRDSStack(app, 'app-subscriptions-service-rds-stack', {
  description: 'Data Services for the subscriptions rds instance',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
