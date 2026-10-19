const { store } = require("../lib/store");
const { createVessel } = require("../models/vessel");
const { HttpError } = require("../lib/errors");

function list(req, res) {
  const all = [...store.vessels.values()];
  const visible = req.user.role === "operator" ? all : all.filter((v) => v.ownerId === req.user.id);
  res.json(200, { items: visible });
}

function create(req, res) {
  res.json(201, createVessel(req.user.id, req.body));
}

function get(req, res) {
  const v = store.vessels.get(req.params.id);
  if (!v || (v.ownerId !== req.user.id && req.user.role !== "operator"))
    throw new HttpError(404, "vessel_not_found", "unknown vessel");
  res.json(200, v);
}

module.exports = { list, create, get };
