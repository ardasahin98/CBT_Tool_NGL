# CBT Tool (web)

Static website that computes CDSS test metrics and estimates cyclic behavior type (CBT)
for every loading cycle, following Sahin et al. (in prep.). The Python metric code runs
in the browser with Pyodide. There is no server, and uploaded files never leave the user's computer.

This version can also load CDSS tests directly from the
[Next Generation Liquefaction (NGL) database](https://nextgenerationliquefaction.org) through
its REST API (see "NGL database connection" below).

## Folder layout

| Path | Contents |
|---|---|
| `index.html`, `css/`, `js/app.js` | Tool page (Plotly charts) |
| `about.html` | Input format, method and citation page |
| `js/ngl.js`, `js/config.js` | NGL sign-in, test-stage browser and loader; API address and optional proxy |
| `serve.py` | Local web server with a relay to the NGL API (`/ngl/...`) |
| `proxy/` | Optional Cloudflare Worker relay for the published site (only if NGL does not allow the site's origin) |
| `js/worker.js` | Web worker that starts Pyodide and calls the Python code |
| `py/cbt_core.py` | Metric and CBT code. The top half is copied verbatim from `ngl_def_v2.py` (`Data_Smooth` … `ru_calc`, `Ns_calculation`, `three_point_curvature`); the bottom half adds hull ratio, Ratio_Δγ, κγ, CBT prediction and the analyst combination |
| `data/models.json` | Posterior samples (4 chains × 1,000) of the final model for each of the 10 analysts |
| `template/`, `examples/` | Input template and three example tests (Example 1 in min, psf and decimal strain; Examples 2–3 in s, kPa and %) |
| `vendor/` | Pyodide 0.29.3 (NumPy 2.2.5, SciPy 1.14.1) and Plotly 2.35.2, hosted locally so the site does not depend on a CDN |
| `tools/build_models.py` | Rebuilds `models.json` from `../Bayesian_Results` |

## Run locally

Browsers block web workers on `file://` pages, so serve the folder:

```
python serve.py
```

Then open http://localhost:8000. `serve.py` is a plain static server plus a relay to the NGL
API, so "Load from NGL database" works locally regardless of NGL's CORS settings.
(`python -m http.server 8000` still works for everything except the NGL connection,
unless NGL allows the origin.)

## Publish (GitHub Pages, free)

1. Create a GitHub repository (for example `cbt-tool`) and push the contents of this folder to it.
2. In the repository, open Settings → Pages and choose "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site will be at `https://<user>.github.io/cbt-tool/`. `.nojekyll` is already included.

Any static host works too: Netlify, Cloudflare Pages, or a UCLA web server.

## Implementation notes

- Units: time (s, min, h) and stress (kPa, MPa, psf, psi, atm) are labels only; all metrics use ratios. Shear strain entered as a decimal is multiplied by 100 in `read_template` (`strain_scale`), and results are reported in percent.

- CBT for analyst *i*: every posterior sample gives μ_s = θ_s·[1, X]. Then μ_i = mean(μ_s) and
  σ_i² = var(μ_s) + mean(σ̂_s²). Analysts are combined with equal weights using
  μ_c = Σ w μ_i and σ_c² = Σ w σ_i² + Σ w (μ_i − μ_c)². The result is back-transformed with expit.
- Default evaluation cycle is the last cycle; the γ_DA = 9% cycle is marked. Tests that stop between 6% and 9% are flagged. Below 6%, no CBT is reported ("CBT for fine-grained soils cannot be assessed").
- κγ is computed once for the whole record. The batch script `Metric_Calculator.ipynb` called
  `Ns_calculation(Data, data_num)` (the test index); the tool passes the number of cycles instead.
- Posterior means and SDs in `models.json` reproduce Table 2 of the paper exactly.

## NGL database connection

"Load from NGL database" (box 2) opens a dialog:

1. **Sign in** with an NGL username/email and password. The browser sends them once, as HTTP
   Basic auth, to `GET /users/api-token` and receives a bearer token that is valid for 2 hours.
   The password is not stored. The token is kept in `sessionStorage` (this tab only) and the
   remaining time is shown next to the button; after 2 hours the user is asked to sign in again.
2. **Browse** the direct simple shear test stages (`/direct-simple-shear-test-stages/api-index`,
   without the `DSSS_DATA` time series). Labels are joined from the DSS tests, specimens,
   samples, lab programs, labs, field tests/sites and plasticity tests endpoints. Filters:
   search text, lab program, lab, site, "Cyclic stages only", and "Include unreviewed data"
   (`includeUnreviewed=1`). Columns sort on click; any other NGL field can be added as a column.
3. **Load** the selected stages: the tool downloads `DSSS_DATA` for those stages only
   (`where=DSSS_ID IN (...)`), converts each to the template layout
   (`DSSS_TIME, DSSS_TAU, DSSS_SIGV, DSSS_YHV, DSSS_EPSV`, units s, kPa, %) and adds it to the
   file list exactly like an uploaded CSV.

Notes

- "Cyclic stages only" uses the first short text field of the stage (or, failing that, of the
  DSS test) whose values contain "cyc". If no such field exists, all stages are listed and the
  dialog says so.
- `DSSS_DATA` is parsed with the same clean-up as `Data_Int` in `ngl_def_v2.py`
  (HTML-escaped quotes, empty list entries).
- **CORS.** The published site calls the NGL API from the user's browser. This works only if
  NGL sends CORS headers for the site's origin. If sign-in on the published site reports that
  the API cannot be reached, either ask the NGL administrators to allow the origin or deploy
  the relay in `proxy/` and set its URL in `js/config.js` (see `proxy/README.md`).
  The tool tries, in order: the local `serve.py` relay (on localhost only), the direct NGL
  address, and the configured proxy.
