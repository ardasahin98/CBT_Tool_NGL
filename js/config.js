// NGL database connection settings (see README, "NGL database connection").
window.NGL_CONFIG = {
  // NGL REST API. Browsers can call it directly only if NGL allows this site's
  // origin (CORS). Otherwise set `proxy` below.
  base: "https://nextgenerationliquefaction.org",
  // Optional relay that adds CORS headers, e.g. the Cloudflare Worker in proxy/:
  // "https://cbt-ngl-proxy.<your-account>.workers.dev". Leave empty if not used.
  proxy: "",
  // Websites allowed to embed the tool and pass it their NGL session (the NGL
  // website's Interpretation Tools page). When the tool runs inside one of them,
  // no separate NGL sign-in is needed. Only these origins are trusted.
  embedOrigins: [
    "https://nextgenerationliquefaction.org",
    "https://www.nextgenerationliquefaction.org",
    "http://localhost:8765",      // local copy of the NGL website (bin/cake server)
    "http://127.0.0.1:8765",
  ],
};
