const { findByEmail, checkPassword, openSession } = require("../models/user");
const { validate } = require("../middleware/validate");
const { HttpError } = require("../lib/errors");

async function login(req, res) {
  const { email, password } = validate({ email: "string", password: "string" }, req.body);
  const user = findByEmail(email);
  if (!user || !checkPassword(user, password)) throw new HttpError(401, "bad_credentials", "invalid email or password");
  res.json(200, { token: openSession(user), role: user.role });
}

module.exports = { login };
