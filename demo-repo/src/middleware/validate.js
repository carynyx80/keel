const { HttpError } = require("../lib/errors");

// Tiny schema validator: { field: "string" | "number" | "boolean" | "iso-date" | "?string" ... }
function validate(schema, body) {
  for (const [field, spec] of Object.entries(schema)) {
    const optional = spec.startsWith("?");
    const type = optional ? spec.slice(1) : spec;
    const value = body[field];
    if (value === undefined || value === null) {
      if (optional) continue;
      throw new HttpError(422, "validation_failed", `${field} is required`);
    }
    if (type === "iso-date") {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        throw new HttpError(422, "validation_failed", `${field} must be an ISO date`);
    } else if (typeof value !== type) {
      throw new HttpError(422, "validation_failed", `${field} must be a ${type}`);
    }
  }
  return body;
}

module.exports = { validate };
