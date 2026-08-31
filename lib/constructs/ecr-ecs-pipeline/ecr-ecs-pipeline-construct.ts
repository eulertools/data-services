import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  EcrSourceAction,
  EcsDeployAction
} from 'aws-cdk-lib/aws-codepipeline-actions';
import {IBaseService} from "aws-cdk-lib/aws-ecs";
import {IRepository} from "aws-cdk-lib/aws-ecr";
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  Cache,
  LinuxBuildImage,
  LocalCacheMode,
  PipelineProject
} from "aws-cdk-lib/aws-codebuild";
import {BuildSpecContent} from "./buildspec-content";
import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import { IBucket } from 'aws-cdk-lib/aws-s3';

interface PipelineProps extends StackProps {
  service: IBaseService,
  repository: IRepository;
  containerName: string;
  artifactBucket: IBucket;
}

export class EcrEcsPipeline extends Construct {
  constructor(stack: Stack, id: string, props?: PipelineProps) {
    super(stack, id);

    const { service, repository, containerName, artifactBucket } = props!;

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const ecrAction = new EcrSourceAction({
      actionName: 'observe-ecr-images',
      output: sourceOutput,
      repository: repository,
    });

    const codeBuildProject = new PipelineProject(stack, `CodeBuildProject`, {
      projectName: `${stack.stackName}-build-project`,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      environmentVariables: {
        IMAGE_URI: {
          value: repository.repositoryUri,
          type: BuildEnvironmentVariableType.PLAINTEXT
        },
        IMAGE_NAME: {
          value: containerName,
          type: BuildEnvironmentVariableType.PLAINTEXT
        },
        TAG: {
          value: 'latest',
          type: BuildEnvironmentVariableType.PLAINTEXT
        }
      },
      buildSpec: BuildSpec.fromObject(BuildSpecContent),
      cache: Cache.local(LocalCacheMode.DOCKER_LAYER, LocalCacheMode.CUSTOM),
    });

    repository.grantPull(codeBuildProject)

    const buildAction = new CodeBuildAction({
      actionName: 'Build-Action',
      input: sourceOutput,
      project: codeBuildProject,
      outputs: [buildOutput],
    });

    const deployAction = new EcsDeployAction({
      actionName: `Deploy-Action-${stack.stackName}`,
      service: service,
      input: buildOutput,
    });

    const pipeline = new codepipeline.Pipeline(this, `${stack.stackName}-CodePipeline`, {
      pipelineName: `${stack.stackName}-pipeline`,
      stages: [
        {
          stageName: 'Source',
          actions: [ecrAction]
        },
        {
          stageName: 'Build',
          actions: [buildAction]
        },
        {
          stageName: 'Deploy',
          actions: [deployAction]
        },
      ],
      artifactBucket: artifactBucket
    });
  }
}
