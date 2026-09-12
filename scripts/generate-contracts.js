import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { API_VERSION, POLICY_DOCUMENT_SCHEMA, SCHEMAS, TOOL_DEFINITIONS } from "../src/contracts/definitions.js";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const json = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const schemaDocument = (name, schema) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://spec-speaker.local/schemas/v1/${name}.schema.json`,
  title: name,
  ...schema,
});

const output = new Map();
for (const [name, schema] of Object.entries(SCHEMAS)) {
  output.set(resolve(`generated/v1/schemas/${name}.schema.json`), json(schemaDocument(name, schema)));
}
output.set(resolve("schemas/v1/policy.schema.json"), json(schemaDocument("policy", POLICY_DOCUMENT_SCHEMA)));

output.set(resolve("generated/v1/mcp-tools.json"), json({
  schemaVersion: API_VERSION,
  tools: TOOL_DEFINITIONS.map(({ name, service, permission, inputSchema, outputSchema, errors }) => ({
    name,
    owningService: service,
    permission,
    inputSchema,
    outputSchema,
    errors,
  })),
}));

const paths = {};
for (const tool of TOOL_DEFINITIONS) {
  paths[`/v1/${tool.name.replaceAll(".", "/")}`] = {
    post: {
      operationId: tool.service,
      "x-permission": tool.permission,
      requestBody: { required: true, content: { "application/json": { schema: tool.inputSchema } } },
      responses: {
        200: { description: "Successful operation", content: { "application/json": { schema: tool.outputSchema } } },
        default: { description: `Errors: ${tool.errors.join(", ")}`, content: { "application/json": { schema: SCHEMAS.ErrorResponse } } },
      },
    },
  };
}
output.set(resolve("generated/v1/openapi.json"), json({
  openapi: "3.1.0",
  info: { title: "Spec Speaker Requirements Engine", version: API_VERSION },
  paths,
}));

const check = process.argv.includes("--check");
let changed = false;
for (const [file, content] of output) {
  let current;
  try { current = await readFile(file, "utf8"); } catch { current = undefined; }
  if (current !== content) {
    changed = true;
    if (!check) {
      await mkdir(new URL(".", `file://${file}`), { recursive: true });
      await writeFile(file, content, "utf8");
    } else {
      console.error(`Generated contract is stale or missing: ${file}`);
    }
  }
}
if (check && changed) process.exitCode = 1;
else console.log(check ? "Generated contracts are current" : `Generated ${output.size} contract files`);
