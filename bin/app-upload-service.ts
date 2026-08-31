import * as cdk from 'aws-cdk-lib';
import { AppUploadServiceStack } from '../lib/app-upload-services/app-upload-service-stack';

const app = new cdk.App();

new AppUploadServiceStack(app, 'app-upload-service-stack', {
  description: "App Upload service stack including lambda handler and api gateway",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
