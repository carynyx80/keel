const { store } = require("../lib/store");
const { HttpError } = require("../lib/errors");

// Bearer token -> session lookup. Sessions expire after 12h.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function authenticate(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "missing_token", "Authorization header required"));

  const session = store.sessions.get(token);
  if (!session) return next(new HttpError(401, "invalid_token", "Unknown session"));
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    store.sessions.delete(token);
    return next(new HttpError(401, "expired_token", "Session expired"));
  }
  req.user = store.users.get(session.userId);
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return next(new HttpError(403, "forbidden", `Requires ${role}`));
    next();
  };
}

module.exports = { authenticate, requireRole, SESSION_TTL_MS };
