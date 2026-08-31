import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDB} from "aws-sdk";
import { Client } from '@opensearch-project/opensearch';

export const handler = async (event: DynamoDBStreamEvent) => {
  const host = process.env.ES_DOMAIN as string;
  const username = process.env.OS_USER || ''
  const password = process.env.OS_PASSWORD || ''
  const node = `https://${host}`
  const index = process.env.ES_INDEX as string;

  console.log('DynamoDB to ES synchronize event triggered');
  console.log('Received event object:', event);
  console.log('ES domain to use:', node);
  console.log('ES index to use:', index);

  if (!event.Records) {
    console.log('No records to process. Exiting');
    return;
  }

  const client = new Client({
    node,
  });

  for (const record of event.Records.filter((item: any) => item.dynamodb)) {
    try {
      let result;

      const keys = record.dynamodb!.Keys;

      console.log(JSON.stringify(record));

      const id = keys?.[process.env.PK!].S;

      if (!id) {
        console.log(
          `Can not detect the ID of the document to index. Make sure the DynamoDB document has a field called '${process.env.PK}'`,
        );
        // eslint-disable-next-line no-continue
        continue;
      }

      if (record.eventName === 'REMOVE') {
        console.log(`Deleting document: ${id}`);
        // eslint-disable-next-line no-await-in-loop
        result = await client.delete({
          index,
          id,
        });
      } else {
        if (!record.dynamodb!.NewImage) {
          console.log(
            'Trying to index new document but the DynamoDB stream event did not provide the NewImage. Skipping...',
          );
          // eslint-disable-next-line no-continue
          continue;
        }

        console.log(`Indexing document: ${id}`);
        const convertedDocument = DynamoDB.Converter.output({ M: record.dynamodb!.NewImage });
        delete convertedDocument.raw;

        console.log('The full object to store is: ', convertedDocument);
        // eslint-disable-next-line no-await-in-loop
        result = await client.index({
          index,
          id,
          body: convertedDocument,
        });
      }

      console.log(result);
    } catch (e) {
      console.error('Failed to process DynamoDB row');
      console.error(record);
      console.error(e);
    }
  }
};
