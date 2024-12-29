import { parse } from "graphql";

import type { DocumentNode } from "graphql";
import { traverseAndEvaluateDirectives } from "./evalute";
import { schema } from "./schema";

function runDemo() {
  const incomingRequest = {
    operationName: null,
    variables: {},
    query: `
         mutation ExampleMutation {
          doSomething {
            success
            nestedValue
          }
        }
      
        query ExampleQuery {
          publicData
          secretData {
            nestedOne
            nestedTwo {
              finalString
            }
          }
        }
        `,
  };

  const document: DocumentNode = parse(incomingRequest.query);
  traverseAndEvaluateDirectives({ document, schema });
}

runDemo();
