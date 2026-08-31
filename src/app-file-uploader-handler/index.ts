import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { S3Client, PutObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const S3 = new S3Client({});

export async function handler(event: any, context: any, callback: any) {
  const response = {
    statusCode: 200,
    body: JSON.stringify({ message: "Lambda Executed Successfully..." }),
  };

  try {
    let path = event.resource;
    let httpMethod = event.httpMethod;
    let route = httpMethod.concat(" ").concat(path);
    const userId = event.requestContext.authorizer.claims.sub;

    switch (route) {
      case "GET /user-file":
        const getParams = new ListObjectsCommand({
          Bucket: process.env.BUCKET_NAME,
          Prefix: `${userId}/files/`,
        });

        await S3.send(getParams).then((data) => {
          const record = data.Contents;
          response.body = JSON.stringify({
            message: "Successfully retrieved files from S3...",
            records: record,
          });
        })
				.catch((err) => {
					console.log({
						message: "Error occured while retrieveing object from s3: ",
						error: JSON.stringify(err),
					});
				});
        break;

      case "POST /user-file":
        const fileId = uuidv4();
        const body = event.body!;

        const uploaPparams = new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: `${userId}/files/${fileId}`,
          Body: body,
          ContentType: "*/*",
        });
        await S3.send(uploaPparams)
          .then(async () => {
            await ddbClient.send(
              new PutItemCommand({
                TableName: process.env.FILE_UPLOADS_TABLE,
                Item: {
                  identifier: { S: `${userId}/files/${fileId}` },
                },
              })
            );
						response.body = JSON.stringify({
							message: "Successfully uploaded file in S3 and file key in dynamodb",
						});
          })
          .catch((err) => {
            console.log({
              message: "Error occured while putting object into s3: ",
              error: JSON.stringify(err),
            });
          });
					break;
    }
  } catch (err) {
    console.log({
      message: "Error occured while performing operation on s3: ",
      error: JSON.stringify(err),
    });
    response.body = JSON.stringify({
      message: "Failed to perform operation on s3 and dynamodb",
      error: JSON.stringify(err),
    });
    response.statusCode = 400;
  }

  return response;
}
