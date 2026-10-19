// In-memory persistence. Swapped for Postgres in production (see ops repo).
let seq = 1000;
const nextId = (prefix) => `${prefix}_${++seq}`;

const store = {
  users: new Map(),
  sessions: new Map(),
  vessels: new Map(),
  bookings: new Map(),
  berths: new Map([
    ["B1", { id: "B1", maxLengthM: 120, maxDraftM: 8, hazmatAllowed: false }],
    ["B2", { id: "B2", maxLengthM: 220, maxDraftM: 12, hazmatAllowed: true }],
    ["B3", { id: "B3", maxLengthM: 60, maxDraftM: 4, hazmatAllowed: false }],
  ]),
};

store.users.set("u_1", { id: "u_1", email: "ops@harbor.test", role: "operator", passwordHash: "c2VjcmV0" });
store.users.set("u_2", { id: "u_2", email: "captain@harbor.test", role: "captain", passwordHash: "YWhveQ==" });

module.exports = { store, nextId };
