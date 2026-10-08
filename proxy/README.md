# NGL CORS relay (optional)

The tool calls the NGL REST API from the user's browser. Browsers allow this only
if `nextgenerationliquefaction.org` sends CORS headers for the tool's address
(for GitHub Pages, `https://ardasahin98.github.io`).

**Preferred:** ask the NGL administrators to allow that origin on the API endpoints
(`/users/api-token` and `*/api-index`): respond to `OPTIONS` preflight requests and add

```
Access-Control-Allow-Origin: https://ardasahin98.github.io
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Accept
```

Then no relay is needed and `js/config.js` can stay as it is.

**Otherwise:** deploy `cloudflare-worker.js` (free tier is plenty):

1. Create a Cloudflare account → Workers & Pages → Create → Worker, name it e.g. `cbt-ngl-proxy`.
2. Replace the worker code with `cloudflare-worker.js`, edit `ALLOWED_ORIGINS` if the site address differs, and deploy.
3. Put the worker URL in `js/config.js`: `proxy: "https://cbt-ngl-proxy.<account>.workers.dev"`.

Note that with a relay, users' NGL credentials and tokens pass through the worker
(over HTTPS). The worker does not log or store them, but the person who controls the
Cloudflare account could change that, so keep the account under the project's control.

For local use none of this is needed: `python serve.py` includes a relay.
