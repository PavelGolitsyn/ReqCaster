function fail(path, reason, errors) {
  errors.push({ path: path || "/", reason });
}

export function validate(schema, value, path = "", errors = []) {
  if (schema.const !== undefined && value !== schema.const) fail(path, `must equal ${JSON.stringify(schema.const)}`, errors);
  if (schema.enum && !schema.enum.includes(value)) fail(path, `must be one of ${schema.enum.join(", ")}`, errors);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(path, "must be an object", errors);
      return errors;
    }
    for (const key of schema.required ?? []) if (!(key in value)) fail(`${path}/${key}`, "is required", errors);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) fail(`${path}/${key}`, "is not allowed", errors);
    }
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) fail(path, `must have at most ${schema.maxProperties} properties`, errors);
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) validate(child, value[key], `${path}/${key}`, errors);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      fail(path, "must be an array", errors);
      return errors;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(path, `must contain at least ${schema.minItems} items`, errors);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path, `must contain at most ${schema.maxItems} items`, errors);
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) fail(path, "must contain unique items", errors);
    value.forEach((item, index) => validate(schema.items, item, `${path}/${index}`, errors));
  } else if (schema.type === "string") {
    if (typeof value !== "string") fail(path, "must be a string", errors);
    else {
      if (schema.minLength !== undefined && value.length < schema.minLength) fail(path, `must be at least ${schema.minLength} characters`, errors);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path, `must be at most ${schema.maxLength} characters`, errors);
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) fail(path, `must match ${schema.pattern}`, errors);
    }
  } else if (schema.type === "integer") {
    if (!Number.isInteger(value)) fail(path, "must be an integer", errors);
    else {
      if (schema.minimum !== undefined && value < schema.minimum) fail(path, `must be >= ${schema.minimum}`, errors);
      if (schema.maximum !== undefined && value > schema.maximum) fail(path, `must be <= ${schema.maximum}`, errors);
    }
  } else if (schema.type === "boolean" && typeof value !== "boolean") fail(path, "must be a boolean", errors);
  return errors;
}

export function isValid(schema, value) {
  return validate(schema, value).length === 0;
}
