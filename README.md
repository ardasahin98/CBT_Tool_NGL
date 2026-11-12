# Cyclic Behavior Type (CBT) Tool

Estimates the cyclic behavior type (CBT) of fine-grained soils, from 0 (clay-like) to 1
(sand-like), from the record of a cyclic direct simple shear (CDSS) test. For every loading
cycle the tool computes the test metrics r<sub>u,max</sub>, Ratio<sub>hull</sub>,
Ratio<sub>Δγ</sub> and κ<sub>γ</sub>, and combines ten Bayesian analyst models into one CBT
estimate with its uncertainty, following Sahin et al. (in preparation).

The tool is a static website. Its Python code runs in the browser with
[Pyodide](https://pyodide.org), so there is no server and uploaded files never leave the
user's computer. Tests can be uploaded as CSV files or loaded directly from the
[Next Generation Liquefaction (NGL) database](https://nextgenerationliquefaction.org).

- **Tool:** https://ardasahin98.github.io/CBT_Tool_NGL/
- **Documentation** (written for engineers): https://ardasahin98.github.io/CBT_Tool_NGL/docs/
  (source in [`docs/`](docs/))

## Citation

Cite version 1.0.0 as:

> Sahin, A., Renugah, V. N. S., Ulmer, K. J., Jana, A., Brandenberg, S. J., Cetin, K. O.,
> Evans, T. M., Kramer, S. L., Stuedlein, A. W., and Stewart, J. P. (2026). *Cyclic Behavior
> Type (CBT) Tool* (version 1.0.0). DesignSafe-CI. DOI to be assigned.

and the paper that describes the method:

> Sahin, A., Renugah, V. N. S., Ulmer, K. J., Jana, A., Brandenberg, S. J., Cetin, K. O.,
> Evans, T. M., Kramer, S. L., Stuedlein, A. W., and Stewart, J. P. Cyclic Behavior Type
> Assessment Conditioned on Laboratory Test Metrics for Fine-grained Soils. In preparation.

Machine-readable metadata are in [`CITATION.cff`](CITATION.cff) and
[`codemeta.json`](codemeta.json). Data loaded from NGL remain subject to the NGL terms of
use; cite their original sources and Brandenberg et al. (2020),
https://doi.org/10.1177/8755293020902477.

## License

BSD 3-Clause; see [`LICENSE`](LICENSE). The libraries in `vendor/` keep their own licenses
(Plotly.js: MIT; Pyodide: MPL-2.0; NumPy and SciPy: BSD 3-Clause).

## Input

One CSV file per CDSS test or test stage, with a header row and the columns time, shear
stress, vertical effective stress, shear strain and (optionally) vertical strain. Time and
stress units only change the labels; strain may be in % or decimal. The template is
[`template/CBT_CDSS_Template.csv`](template/CBT_CDSS_Template.csv) and three examples are in
[`examples/`](examples/). See [Preparing test files](https://ardasahin98.github.io/CBT_Tool_NGL/docs/input-files.html).

The models were calibrated on stress-controlled CDSS tests on intact fine-grained specimens
(fines content > 30%) with no initial static shear stress, carried to γ<sub>DA</sub> ≥ 9%.

## Folder layout

| Path | Contents |
|---|---|
| `index.html`, `css/`, `js/app.js` | Tool page (Plotly charts) |
| `about.html` | Input format, method, symbols, citation and license, as one page |
| `license.html` | Redirect to the license section of `about.html` |
| `py/cbt_core.py` | Metric and CBT code. The top half is copied verbatim from `ngl_def_v2.py` (`Data_Smooth` … `ru_calc`, `Ns_calculation`, `three_point_curvature`); the bottom half adds hull ratio, Ratio_Δγ, κγ, CBT prediction and the analyst combination |
| `js/worker.js` | Web worker that starts Pyodide and calls the Python code |
| `data/models.json` | Posterior samples (4 chains × 1,000) of the final model for each of the 10 analysts |
| `js/export.js` | Downloads: results and raw data as .zip files with a disclaimer; `TOOL_VERSION` |
| `js/ngl.js`, `js/config.js` | NGL sign-in, test-stage browser and loader; API address and optional proxy |
| `template/`, `examples/` | Input template and three example tests (Example 1 in min, psf and decimal strain; Examples 2–3 in s, kPa and %) |
| `vendor/` | Pyodide 0.29.3 (NumPy 2.2.5, SciPy 1.14.1) and Plotly 2.35.2, hosted locally so the site does not depend on a CDN |
| `serve.py` | Local web server with a relay to the NGL API (`/ngl/...`) |
| `vercel.json` | Same `/ngl/...` relay when the site is hosted on Vercel |
| `proxy/` | Optional Cloudflare Worker relay (only if NGL does not allow the site's origin) |
| `tools/build_models.py` | Rebuilds `models.json` from `../Bayesian_Results` |
| `docs/`, `tools/build_docs.py` | Documentation pages and the script that builds the published site |
| `.github/workflows/pages.yml` | Builds the site and publishes it to GitHub Pages on every push to `main` |
| `CITATION.cff`, `codemeta.json` | Citation and software metadata |

## Run locally

Browsers block web workers on `file://` pages, so serve the folder:

```
python serve.py
```

Then open http://localhost:8000. `serve.py` is a plain static server plus a relay to the NGL
API, so "Load from NGL database" works locally regardless of NGL's CORS settings.
(`python -m http.server 8000` still works for everything except the NGL connection.)

## Documentation and GitHub Pages

The documentation pages are HTML fragments in `docs/pages/`, wrapped in `docs/_layout.html`
by `tools/build_docs.py` (Python standard library only), which builds the published site into
`_site/`: the tool at the root and the documentation in `_site/docs/`. The script also checks
every internal link, and fills the analyst predictor table from `data/models.json` and the
version from `js/export.js`.

```
python tools/build_docs.py           # build _site/
python tools/build_docs.py --serve   # build, then serve at http://localhost:8081/docs/
```

Pushing to `main` runs `.github/workflows/pages.yml`, which builds `_site/` and publishes it.
One-time setup: Settings → Pages → Build and deployment → Source: **GitHub Actions**. The
screenshots in `docs/images/` are taken from the running tool with the examples loaded;
retake them after changing the interface.

Any static host works for the tool alone (Netlify, Cloudflare Pages, a UCLA or NGL web
server): copy the repository without `.git`, `docs/`, `tools/` and `_site/`.

## Releasing a version

1. Set the version in `js/export.js` (`TOOL_VERSION`), the footers of `index.html` and
   `about.html`, `CITATION.cff` and `codemeta.json` (with the release date).
2. Update the `?v=` cache-busting suffixes in `index.html` for the files that changed.
3. Commit, tag (`git tag v1.0.0`), push, and create a GitHub release from the tag.
4. Publish the release on DesignSafe, then add the DOI to `CITATION.cff` (`doi:` and
   `identifiers:`), `codemeta.json` (`identifier`), this README, `about.html#cite` and
   `docs/pages/citing.html`.

## Implementation notes

- Units: time (s, min, h) and stress (kPa, MPa, psf, psi, atm) are labels only; all metrics use ratios. Shear strain entered as a decimal is multiplied by 100 in `read_template` (`strain_scale`), and results are reported in percent.

- CBT for analyst *i*: every posterior sample gives μ_s = θ_s·[1, X]. Then μ_i = mean(μ_s) and
  σ_i² = var(μ_s) + mean(σ̂_s²). Analysts are combined with equal weights using
  μ_c = Σ w μ_i and σ_c² = Σ w σ_i² + Σ w (μ_i − μ_c)². The result is back-transformed with expit.
- Default evaluation cycle is the last cycle; the γ_DA = 9% cycle is marked. CBT is reported for every test (the former
  6% cut-off was removed). Tests that stop before γ_DA = 9% get a yellow caution on every tab and in the downloads.
- κγ is computed once for the whole record. If γ_SA = 3% is not reached, N_s is the last cycle and κγ is computed from
  γ_SA/γ_SA,last versus N/N_last (time over the time at the end of the last cycle), with the 10/50/90% points taken up
  to the end of the last cycle. `strain_curvature` also checks that 3% was actually reached, because `Ns_calculation`
  can return N_s < N for records that stop below 3%.
- A_loop for Ratio_hull uses Simpson's rule as in the paper. If the Simpson ratio is negative, above 1 while the trapezoid ratio is not, or differs from
  the trapezoid rule by more than 0.02 (as a fraction of A_hull), the trapezoid rule is used for that cycle. Simpson's
  rule can blow up when smoothed strain has zero or near-zero steps (coarsely quantized strain, e.g. NGL DSSS_ID 280,
  cycle 16). The method used is reported per cycle (`hull_method` in the results CSV). The batch script `Metric_Calculator.ipynb` called
  `Ns_calculation(Data, data_num)` (the test index); the tool passes the number of cycles instead.
- Posterior means and SDs in `models.json` reproduce Table 2 of the paper exactly.

## Downloads (Export box)

Every download is a .zip with the CSV file(s) and `DISCLAIMER.txt` (wording in `disclaimerText()` in `js/export.js`).
The dropdown in the Export box picks the tests to download (all, none, the current test, or any combination;
new tests are ticked by default). "Results" and "Raw data" download the ticked tests.

- **Results:** `<test>_CBT_cycles.csv` per test (metrics and CBT for every cycle; the header gives the
  source, and for NGL tests the IDs and index properties). Batch downloads add `CBT_summary.csv`
  (one row per test: IDs, e0, w0, LL, PL, PI, whether γDA = 9% was reached, N_s and its basis, metrics and CBT at the last
  cycle and at the γDA = 9% cycle). Batch downloads are made when more than one test is ticked.
- **Raw data:** NGL stages use the NGL lab test viewer layout (`NGL_DirectSimpleShearTest_DSSS_ID_<id>.csv`:
  reference, LAB, LAB_PROGRAM, CITATION, SPECIMEN, SAMPLES, PLAS, DSSG, DSSS metadata and data).
  Uploaded files keep their own columns and units, under a short header with the file name and units.

## NGL database connection

"Load from NGL database" (box 2) opens a dialog:

1. **Sign in** with an NGL account email and password (the token endpoint accepts the email, not the username). The browser sends them once, as HTTP
   Basic auth, to `GET /users/api-token` and receives a bearer token that is valid for 2 hours.
   The password is not stored. The token is kept in `sessionStorage` (this tab only) and the
   remaining time is shown next to the button; after 2 hours the user is asked to sign in again.
2. **Browse** the direct simple shear test stages (`/direct-simple-shear-test-stages/api-index`,
   without the `DSSS_DATA` time series). Labels are joined from the DSS tests, specimens,
   samples, lab programs, lab program citations, labs and plasticity tests endpoints. The table
   has the same columns as the NGL lab test viewer (Lab, Lab Program, Citation ID, Sample,
   Specimen, e0, w0, LL, PL, Stage, Loading Type, Drainage) with a search box under each
   header; headers sort on click and any other NGL field can be added as a column.
   "Cyclic stages only" and "Include unreviewed data" (`includeUnreviewed=1`) are on by default.
3. **Load** the selected stages: the tool downloads `DSSS_DATA` for those stages only
   (`where=DSSS_ID IN (...)`), converts each to the template layout
   (`DSSS_TIME, DSSS_TAU, DSSS_SIGV, DSSS_YHV, DSSS_EPSV`, units s, kPa, %) and adds it to the
   file list exactly like an uploaded CSV.

Notes

- Loading type and drainage follow the NGL schema (`schema/tables/DSSS.html`):
  `DSSS_TY` = 0 consolidation, 1 monotonic loading, 2 cyclic loading; `DSSS_DR` = 0 drained,
  1 undrained. "Cyclic stages only" keeps stages with `DSSS_TY = 2`. e0 and w0 are `DSSG_E0`
  and `DSSG_W0`; LL and PL are `PLAS_LL` and `PLAS_PL` (joined by `SPEC_ID`); Citation ID comes
  from `LAB_PROGRAMP` (Lab programs ↔ Citations).
- `DSSS_DATA` is parsed with the same clean-up as `Data_Int` in `ngl_def_v2.py`
  (HTML-escaped quotes, empty list entries).
- **CORS.** Browsers block a page from calling another site's API unless that site allows it,
  and NGL does not send CORS headers. The tool therefore calls the API through a relay on its
  own address, `/ngl/...`:
  - **Vercel:** `vercel.json` rewrites `/ngl/users/api-token` and `/ngl/<table>/api-index` to
    `https://nextgenerationliquefaction.org`. Vercel forwards the request server-side, so it
    works with no extra service. Keep `vercel.json` at the repository root.
  - **Local:** `python serve.py` provides the same `/ngl/...` relay.
  - **GitHub Pages or other static hosts** cannot relay. Either ask the NGL administrators to
    allow the site's origin, or deploy the Cloudflare Worker in `proxy/` and set its URL in
    `js/config.js` (see `proxy/README.md`).

  The tool tries, in order: the `/ngl` relay on the same address, NGL directly, and the
  configured proxy. If all fail, the error message lists what happened with each.
