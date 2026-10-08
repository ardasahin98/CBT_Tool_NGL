// CORS relay for the NGL REST API, for the published (GitHub Pages) tool.
// Needed only if nextgenerationliquefaction.org does not send CORS headers for
// the tool's address. Deploy free on Cloudflare Workers (see proxy/README.md),
// then put the worker URL in js/config.js -> proxy.
//
// The relay forwards only the token and api-index endpoints, adds CORS headers
// for the origins listed below, and does not log or store anything.

const NGL = "https://nextgenerationliquefaction.org";
const ALLOWED_ORIGINS = [
  "https://ardasahin98.github.io",   // GitHub Pages site (origin only, no path)
  "http://localhost:8000",
];
const ALLOWED_PATH = /^\/(users\/api-token|[a-z0-9-]+\/api-index)$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) 134.0.6998.118 Safari/537.36";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response("Origin not allowed", { status: 403, headers: cors });

    const url = new URL(request.url);
    if (!ALLOWED_PATH.test(url.pathname) || !["GET", "POST"].includes(request.method)) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const headers = new Headers({ "User-Agent": UA });
    for (const h of ["Authorization", "Accept", "Content-Type"]) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const upstream = await fetch(NGL + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    });
    const out = new Headers(cors);
    out.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    out.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
