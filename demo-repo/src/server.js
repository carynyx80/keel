const http = require("http");
const { createRouter } = require("./router");
const { authenticate } = require("./middleware/auth");
const vessels = require("./routes/vessels");
const bookings = require("./routes/bookings");
const auth = require("./routes/auth");

const router = createRouter();

router.post("/auth/login", auth.login);
router.get("/vessels", authenticate, vessels.list);
router.post("/vessels", authenticate, vessels.create);
router.get("/vessels/:id", authenticate, vessels.get);
router.get("/bookings", authenticate, bookings.list);
router.post("/bookings", authenticate, bookings.create);
router.post("/bookings/:id/cancel", authenticate, bookings.cancel);
router.get("/bookings/:id/quote", authenticate, bookings.quote);

function start(port = process.env.PORT || 8080) {
  const server = http.createServer((req, res) => router.handle(req, res));
  server.listen(port, () => console.log(`harbor-api listening on ${port}`));
  return server;
}

if (require.main === module) start();

module.exports = { start, router };
