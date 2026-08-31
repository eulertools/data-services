export const BuildSpecContent = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': {
        nodejs: '14',
      },
      commands: ['npm install'],
    },
    pre_build: {
      commands: ['echo Pre Build Running'],
    },
    build: {
      commands: ['echo Build started'],
    },
    post_build: {
      commands: [
        'echo Build completed',
        'printf \'{"ImageURI": "%s"}\' $IMAGE_URI:$TAG > taskdef.json',
        'cat taskdef.json',
        `printf \'[{"name":"%s","imageUri": "%s"}]\' $IMAGE_NAME $IMAGE_URI:$TAG > imagedefinitions.json`,
        'cat imagedefinitions.json',
      ],
    },
  },
  artifacts: {
    files: ['imageDetail.json', 'imagedefinitions.json', 'appspec.yaml', 'taskdef.json'],
  },
};
