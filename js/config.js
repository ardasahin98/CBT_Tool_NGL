// NGL database connection settings (see README, "NGL database connection").
window.NGL_CONFIG = {
  // NGL REST API. Browsers can call it directly only if NGL allows this site's
  // origin (CORS). Otherwise set `proxy` below.
  base: "https://nextgenerationliquefaction.org",
  // Optional relay that adds CORS headers, e.g. the Cloudflare Worker in proxy/:
  // "https://cbt-ngl-proxy.<your-account>.workers.dev". Leave empty if not used.
  proxy: "",
};
