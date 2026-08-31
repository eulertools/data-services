#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppMarketplaceServiceStack } from '../lib/app-marketplace-services/app-marketplace-service-stack';
import { AppMarketPlacePipelineStack } from '../lib/app-marketplace-services/app-marketplace-worker';
import { ECRStack } from '../lib/app-marketplace-services/ecr-stack';
import { ECSStack } from "../lib/app-marketplace-services/ecs-stack";

const app = new cdk.App();

new ECRStack(app, 'marketplace-repository', {
  description: 'ECR Repositories for the data-services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new ECSStack(app, 'marketplace-services', {
  description: 'Setups ECS Clusters for the data-services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new AppMarketplaceServiceStack(app, 'app-marketplace-stack', {
  description: "Marketplace datalake including elasticsearch syncer and dynamodb",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

new AppMarketPlacePipelineStack(app, 'marketplace-client-pipeline', {
  description: 'Setup ECS Stack and pipeline for the data services',
  tags: { usage: 'data-services' },
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});
