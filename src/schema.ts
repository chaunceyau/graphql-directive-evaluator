import { buildSchema, type GraphQLSchema } from "graphql";

// example schema for demo purposes
export const SDL = `
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

export const schema: GraphQLSchema = buildSchema(SDL);
