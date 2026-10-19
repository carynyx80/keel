const { store, nextId } = require("../lib/store");
const { validate } = require("../middleware/validate");

const VesselSchema = { name: "string", imo: "string", lengthM: "number", draftM: "number", hazmat: "?boolean" };

function createVessel(ownerId, input) {
  const data = validate(VesselSchema, input);
  if (!/^IMO\d{7}$/.test(data.imo)) {
    const { HttpError } = require("../lib/errors");
    throw new HttpError(422, "validation_failed", "imo must look like IMO1234567");
  }
  for (const v of store.vessels.values()) {
    if (v.imo === data.imo) {
      const { HttpError } = require("../lib/errors");
      throw new HttpError(409, "duplicate_imo", "vessel already registered");
    }
  }
  const vessel = { id: nextId("v"), ownerId, hazmat: false, ...data };
  store.vessels.set(vessel.id, vessel);
  return vessel;
}

module.exports = { createVessel, VesselSchema };
