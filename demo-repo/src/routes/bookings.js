const { store } = require("../lib/store");
const { createBooking, cancelBooking } = require("../models/booking");
const { cancellationFee } = require("../lib/pricing");
const { HttpError } = require("../lib/errors");

function list(req, res) {
  const items = [...store.bookings.values()].filter(
    (b) => req.user.role === "operator" || b.userId === req.user.id
  );
  const status = req.query.status;
  res.json(200, { items: status ? items.filter((b) => b.status === status) : items });
}

function create(req, res) {
  res.json(201, createBooking(req.user, req.body));
}

function cancel(req, res) {
  res.json(200, cancelBooking(req.user, req.params.id));
}

// What would it cost to cancel right now?
function quote(req, res) {
  const b = store.bookings.get(req.params.id);
  if (!b || (b.userId !== req.user.id && req.user.role !== "operator"))
    throw new HttpError(404, "booking_not_found", "unknown booking");
  res.json(200, { bookingId: b.id, fee: b.fee, cancellationFee: cancellationFee(b.fee, b.arrival) });
}

module.exports = { list, create, cancel, quote };
