const { store, nextId } = require("../lib/store");
const { validate } = require("../middleware/validate");
const { HttpError } = require("../lib/errors");
const { berthFee, cancellationFee } = require("../lib/pricing");

const BookingSchema = { vesselId: "string", berthId: "string", arrival: "iso-date", departure: "iso-date" };

function overlaps(a, b) {
  return new Date(a.arrival) < new Date(b.departure) && new Date(b.arrival) < new Date(a.departure);
}

function createBooking(user, input) {
  const data = validate(BookingSchema, input);
  const vessel = store.vessels.get(data.vesselId);
  if (!vessel) throw new HttpError(404, "vessel_not_found", "unknown vessel");
  if (vessel.ownerId !== user.id && user.role !== "operator")
    throw new HttpError(403, "forbidden", "not your vessel");

  const berth = store.berths.get(data.berthId);
  if (!berth) throw new HttpError(404, "berth_not_found", "unknown berth");
  if (vessel.lengthM > berth.maxLengthM) throw new HttpError(409, "berth_too_short", "vessel too long for berth");
  if (vessel.draftM > berth.maxDraftM) throw new HttpError(409, "berth_too_shallow", "vessel draft exceeds berth");
  if (vessel.hazmat && !berth.hazmatAllowed) throw new HttpError(409, "hazmat_not_allowed", "berth refuses hazmat");

  for (const b of store.bookings.values()) {
    if (b.berthId === data.berthId && b.status === "confirmed" && overlaps(b, data))
      throw new HttpError(409, "berth_unavailable", "berth already booked for that window");
  }

  const fee = berthFee({ lengthM: vessel.lengthM, arrival: data.arrival, departure: data.departure, hazmat: vessel.hazmat });
  const booking = { id: nextId("bk"), ...data, userId: user.id, fee, status: "confirmed", createdAt: Date.now() };
  store.bookings.set(booking.id, booking);
  return booking;
}

function cancelBooking(user, id, now = Date.now()) {
  const booking = store.bookings.get(id);
  if (!booking) throw new HttpError(404, "booking_not_found", "unknown booking");
  if (booking.userId !== user.id && user.role !== "operator") throw new HttpError(403, "forbidden", "not your booking");
  if (booking.status !== "confirmed") throw new HttpError(409, "not_cancellable", `booking is ${booking.status}`);
  booking.status = "cancelled";
  booking.cancellationFee = cancellationFee(booking.fee, booking.arrival, now);
  return booking;
}

module.exports = { createBooking, cancelBooking, overlaps, BookingSchema };
