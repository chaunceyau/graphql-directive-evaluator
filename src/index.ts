import {
  buildSchema,
  parse,
  validate,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  getNamedType,
  isObjectType,
  isInterfaceType,
  isUnionType,
} from "graphql";

import type {
  GraphQLFieldMap,
  GraphQLField,
  OperationDefinitionNode,
  SelectionSetNode,
  FieldNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  FragmentDefinitionNode,
  DocumentNode,
  ConstDirectiveNode,
} from "graphql";

function runAndEvaluateFunctionPerformance(fn: Function) {
  const start = Bun.nanoseconds();
  const value = fn();
  const end = Bun.nanoseconds();
  const timeNanoseconds = end - start;
  console.log(
    fn.name +
      " performance time, ns: " +
      timeNanoseconds +
      "; ms: " +
      timeNanoseconds / 1000000
  );
  return { value, timeMs: timeNanoseconds / 1000000 };
}

function buildAndParseSchema() {
  const sdl = `
        directive @authPolicy(scopes: [String!]!) on FIELD_DEFINITION
      
        type Query {
          publicData: String
          secretData: SecretData @authPolicy(scopes: ["read.secretData"])
        }
      
        type SecretData {
          nestedOne: String
          nestedTwo: Nested @authPolicy(scopes: ["read.nestedTwo"])
        }
      
        type Nested {
          finalString: String
        }
      
        type Mutation {
          doSomething: DoSomethingResult @authPolicy(scopes: ["manage.updateSomething"])
        }
      
        type DoSomethingResult {
          success: Boolean
          nestedValue: String @authPolicy(scopes: ["read.nestedValueResult"])
        }
      `;

  const schema: GraphQLSchema = buildSchema(sdl);

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
  return { document, schema };
}

function traverseAndEvaluateDirectives({
  document,
  schema,
}: {
  document: DocumentNode;
  schema: GraphQLSchema;
}) {
  // OPTIONAL: Validate the document against the schema
  // const validationErrors = validate(schema, document);
  // if (validationErrors.length > 0) {
  //   console.error("Validation errors:", validationErrors);
  //   // You might throw an error or handle it, depending on your use case
  // }

  // 3. We'll extract all fragment definitions (if any) for reuse
  //    If the query had named fragments, we'd need them for inline/fragment spreads
  const fragmentMap: Record<string, FragmentDefinitionNode> = {};
  for (const definition of document.definitions) {
    if (definition.kind === "FragmentDefinition") {
      fragmentMap[definition.name.value] = definition;
    }
  }

  // Helper function to check a single operation (query/mutation/subscription)
  function checkOperation(
    schema: GraphQLSchema,
    operation: OperationDefinitionNode
  ) {
    let rootType: GraphQLObjectType | null = null;

    // Identify the root type (Query, Mutation, or Subscription)
    switch (operation.operation) {
      case "query":
        rootType = schema.getQueryType() ?? null;
        break;
      case "mutation":
        rootType = schema.getMutationType() ?? null;
        break;
      case "subscription":
        rootType = schema.getSubscriptionType() ?? null;
        break;
    }

    if (!rootType) {
      return; // If there's no root type for this operation, skip
    }

    // Recursively walk the selection set
    checkSelectionSet(schema, rootType, operation.selectionSet);
  }

  // Recursively checks each Selection in a SelectionSet
  function checkSelectionSet(
    schema: GraphQLSchema,
    parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    selectionSet: SelectionSetNode
  ) {
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case "Field":
          checkField(schema, parentType, selection);
          break;

        case "InlineFragment":
          checkInlineFragment(schema, parentType, selection);
          break;

        case "FragmentSpread":
          checkFragmentSpread(schema, parentType, selection);
          break;
      }
    }
  }

  // Handle a Field selection
  function checkField(
    schema: GraphQLSchema,
    parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    fieldNode: FieldNode
  ) {
    const fieldName = fieldNode.name.value;

    // Get possible fields depending on whether parent is an object, interface, or union
    let fields: GraphQLFieldMap<any, any> | undefined;
    if (isObjectType(parentType)) {
      fields = parentType.getFields();
    } else if (isInterfaceType(parentType)) {
      // In an interface, we’d likely check implementors or handle differently
      fields = parentType.getFields();
    } else if (isUnionType(parentType)) {
      // For a union, we'd have to check each possible type in the union
      // but let's keep it simple: skip or handle union logic here
      return;
    }
    if (!fields) return;

    const fieldDef: GraphQLField<any, any> | undefined = fields[fieldName];
    if (!fieldDef) {
      // The field doesn't exist on this type—likely an invalid query unless they used a fragment
      return;
    }

    // 4. Check if the field has a @authPolicy directive in its AST
    const fieldAstNode = fieldDef.astNode;
    if (fieldAstNode?.directives) {
      for (const directive of fieldAstNode.directives) {
        if (directive.name.value === "authPolicy") {
          evaluateAuthDirective({ fieldName, parentType, directive });
          // Here’s where you'd do your actual auth enforcement logic
        }
      }
    }

    // 5. If the field returns an object (or interface/union), recurse into its selection set
    //    e.g. secretData -> SecretData -> nestedTwo -> ...
    const fieldType = getNamedType(fieldDef.type);
    if (fieldNode.selectionSet) {
      if (
        isObjectType(fieldType) ||
        isInterfaceType(fieldType) ||
        isUnionType(fieldType)
      ) {
        checkSelectionSet(schema, fieldType, fieldNode.selectionSet);
      }
    }
  }

  // Handle an InlineFragment
  function checkInlineFragment(
    schema: GraphQLSchema,
    parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    inlineFragment: InlineFragmentNode
  ) {
    // If there's a typeCondition, we refine the parentType
    let fragmentType = parentType;
    if (inlineFragment.typeCondition) {
      const typeName = inlineFragment.typeCondition.name.value;
      const typeFromSchema = schema.getType(typeName);
      if (
        typeFromSchema &&
        (isObjectType(typeFromSchema) ||
          isInterfaceType(typeFromSchema) ||
          isUnionType(typeFromSchema))
      ) {
        fragmentType = typeFromSchema;
      }
    }
    if (inlineFragment.selectionSet) {
      checkSelectionSet(schema, fragmentType, inlineFragment.selectionSet);
    }
  }

  // Handle a FragmentSpread (references a named fragment)
  function checkFragmentSpread(
    schema: GraphQLSchema,
    parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
    fragmentSpread: FragmentSpreadNode
  ) {
    const fragmentName = fragmentSpread.name.value;
    const fragmentDef = fragmentMap[fragmentName];
    if (!fragmentDef) return;

    // If the fragment has a type condition, refine the parentType
    let fragmentType = parentType;
    if (fragmentDef.typeCondition) {
      const typeName = fragmentDef.typeCondition.name.value;
      const typeFromSchema = schema.getType(typeName);
      if (
        typeFromSchema &&
        (isObjectType(typeFromSchema) ||
          isInterfaceType(typeFromSchema) ||
          isUnionType(typeFromSchema))
      ) {
        fragmentType = typeFromSchema;
      }
    }
    checkSelectionSet(schema, fragmentType, fragmentDef.selectionSet);
  }

  // 6. Finally, loop through all operation definitions (query/mutation/subscription)
  for (const definition of document.definitions) {
    if (definition.kind === "OperationDefinition") {
      checkOperation(schema, definition);
    }
  }
}

const loops = 3;
let accTimeMs = { build: 0, traverse: 0 };
for (let i = 0; i < loops; i++) {
  const { value, timeMs: buildTimeMs } = runAndEvaluateFunctionPerformance(
    function build() {
      return buildAndParseSchema();
    }
  );
  const { timeMs: traverseTimeMs } = runAndEvaluateFunctionPerformance(
    function traverse() {
      return traverseAndEvaluateDirectives(value);
    }
  );
  accTimeMs.build += buildTimeMs;
  accTimeMs.traverse += traverseTimeMs;
}
console.log(accTimeMs.build / loops);
console.log(accTimeMs.traverse / loops);

function evaluateAuthDirective({
  fieldName,
  parentType,
  directive,
}: {
  fieldName: string;
  parentType: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType;
  directive: ConstDirectiveNode;
}) {
  //   console.log(
  //     `Field "${fieldName}" on type "${parentType.name}" requires authPolicy eval!`
  //   );

  const scopesArgument = directive.arguments?.find(
    (arg) => arg.name.value === "scopes"
  );
  if (scopesArgument?.value.kind === "ListValue") {
    const requiredScopes = scopesArgument?.value.values
      .filter((val) => val.kind === "StringValue")
      .map((v) => v.value);
    // console.log("required request scopes", requiredScopes);
  }
}
