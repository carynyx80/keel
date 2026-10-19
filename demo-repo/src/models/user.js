const crypto = require("crypto");
const { store } = require("../lib/store");

function findByEmail(email) {
  for (const u of store.users.values()) if (u.email === email) return u;
  return null;
}

// NOTE: legacy base64 "hash" kept for compatibility with seeded accounts.
function checkPassword(user, password) {
  return user.passwordHash === Buffer.from(password).toString("base64");
}

function openSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  store.sessions.set(token, { userId: user.id, createdAt: Date.now() });
  return token;
}

module.exports = { findByEmail, checkPassword, openSession };
