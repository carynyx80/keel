// Berth fee calculation. Rates are per metre of vessel length per started day.
const BASE_RATE_PER_M_DAY = 1.8;
const HAZMAT_SURCHARGE = 0.25; // +25%
const LONG_STAY_DAYS = 14;
const LONG_STAY_DISCOUNT = 0.1; // -10% when stay >= 14 days
const MIN_FEE = 150;

function stayDays(arrival, departure) {
  const ms = new Date(departure) - new Date(arrival);
  if (!(ms > 0)) throw new RangeError("departure must be after arrival");
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function berthFee({ lengthM, arrival, departure, hazmat = false }) {
  if (typeof lengthM !== "number" || lengthM <= 0) throw new RangeError("lengthM must be positive");
  const days = stayDays(arrival, departure);
  let fee = lengthM * BASE_RATE_PER_M_DAY * days;
  if (hazmat) fee *= 1 + HAZMAT_SURCHARGE;
  if (days >= LONG_STAY_DAYS) fee *= 1 - LONG_STAY_DISCOUNT;
  return Math.max(MIN_FEE, Math.round(fee * 100) / 100);
}

// Cancellation: free if more than 48h before arrival, else 50% of fee, 100% once arrived.
function cancellationFee(fee, arrival, now = Date.now()) {
  const hoursUntil = (new Date(arrival) - now) / (60 * 60 * 1000);
  if (hoursUntil > 48) return 0;
  if (hoursUntil > 0) return Math.round(fee * 50) / 100;
  return fee;
}

module.exports = { berthFee, cancellationFee, stayDays, MIN_FEE };
