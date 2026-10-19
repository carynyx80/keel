// Minimal router: method + path pattern with :params, middleware chain, JSON bodies.
function compile(pattern) {
  const keys = [];
  const re = pattern.replace(/:(\w+)/g, (_, k) => {
    keys.push(k);
    return "([^/]+)";
  });
  return { re: new RegExp(`^${re}$`), keys };
}

function createRouter() {
  const routes = [];

  function add(method, pattern, ...handlers) {
    routes.push({ method, ...compile(pattern), handlers });
  }

  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function send(res, status, payload) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://local");
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return send(res, 404, { error: "not_found" });

    const match = url.pathname.match(route.re);
    req.params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    req.query = Object.fromEntries(url.searchParams);
    req.body = await readBody(req);
    if (req.body === null) return send(res, 400, { error: "invalid_json" });
    res.json = (status, payload) => send(res, status, payload);

    let i = 0;
    const next = async (err) => {
      if (err) return send(res, err.status || 500, { error: err.code || "internal", message: err.message });
      const h = route.handlers[i++];
      if (!h) return;
      try {
        await h(req, res, next);
      } catch (e) {
        next(e);
      }
    };
    await next();
  }

  return {
    get: (p, ...h) => add("GET", p, ...h),
    post: (p, ...h) => add("POST", p, ...h),
    handle,
  };
}

module.exports = { createRouter };
