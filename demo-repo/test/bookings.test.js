const test = require("node:test");
const assert = require("node:assert");
const { store } = require("../src/lib/store");
const { createVessel } = require("../src/models/vessel");
const { createBooking, cancelBooking } = require("../src/models/booking");

const operator = { id: "u_1", role: "operator" };
const captain = { id: "u_2", role: "captain" };

test("books a berth and blocks overlaps", () => {
  const v = createVessel(captain.id, { name: "Gull", imo: "IMO1234567", lengthM: 50, draftM: 3 });
  const b = createBooking(captain, { vesselId: v.id, berthId: "B3", arrival: "2026-06-01", departure: "2026-06-03" });
  assert.strictEqual(b.status, "confirmed");
  assert.throws(
    () => createBooking(operator, { vesselId: v.id, berthId: "B3", arrival: "2026-06-02", departure: "2026-06-04" }),
    /already booked/
  );
  const c = cancelBooking(captain, b.id, Date.parse("2026-05-01"));
  assert.strictEqual(c.cancellationFee, 0);
  store.bookings.clear();
});
