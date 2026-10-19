const test = require("node:test");
const assert = require("node:assert");
const { berthFee, cancellationFee, stayDays } = require("../src/lib/pricing");

test("stayDays rounds up partial days", () => {
  assert.strictEqual(stayDays("2026-05-01T00:00:00Z", "2026-05-02T01:00:00Z"), 2);
});

test("berthFee applies minimum fee", () => {
  assert.strictEqual(berthFee({ lengthM: 10, arrival: "2026-05-01", departure: "2026-05-02" }), 150);
});

test("berthFee hazmat surcharge", () => {
  assert.strictEqual(berthFee({ lengthM: 100, arrival: "2026-05-01", departure: "2026-05-03", hazmat: true }), 450);
});

test("berthFee long stay discount", () => {
  assert.strictEqual(berthFee({ lengthM: 100, arrival: "2026-05-01", departure: "2026-05-15" }), 2268);
});

test("cancellation is free > 48h out", () => {
  const now = Date.parse("2026-05-01T00:00:00Z");
  assert.strictEqual(cancellationFee(1000, "2026-05-04T00:00:00Z", now), 0);
  assert.strictEqual(cancellationFee(1000, "2026-05-02T00:00:00Z", now), 500);
  assert.strictEqual(cancellationFee(1000, "2026-04-30T00:00:00Z", now), 1000);
});

test("rejects bad input", () => {
  assert.throws(() => berthFee({ lengthM: -1, arrival: "2026-05-01", departure: "2026-05-02" }), RangeError);
  assert.throws(() => stayDays("2026-05-02", "2026-05-01"), RangeError);
});
