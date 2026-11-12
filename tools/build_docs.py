"""Build the documentation website, and the site published to GitHub Pages, into _site/.

    python tools/build_docs.py            build _site/ (the tool at the root, the docs in _site/docs/)
    python tools/build_docs.py --serve    build, then serve _site/ at http://localhost:8081/

Each page in docs/pages/ is an HTML fragment wrapped in docs/_layout.html.
The first lines of a page set its title and summary:
    <!-- title: Your first test -->
    <!-- description: ... -->
Comments like these are replaced when the page is built:
    <!-- figure: overview.png | Caption text -->   a screenshot from docs/images/, with a caption
    <!-- analysts -->                               the analyst models and their predictors, read
                                                    from data/models.json so the table matches the tool
    <!-- version -->                                the tool version, from TOOL_VERSION in js/export.js
Only the Python standard library is used.
"""
import functools
import html
import http.server
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = ROOT / "_site"

# Address of the tool, relative to the docs pages. On GitHub Pages the tool is published
# one level up (_site/index.html). Change this to an absolute URL if the tool is hosted elsewhere.
TOOL_URL = "../index.html"
REPO_URL = "https://github.com/ardasahin98/CBT_Tool_NGL"

# Files and folders of the repository that are not part of the published tool.
NOT_PUBLISHED = {".git", ".github", ".gitignore", ".DS_Store", "_site", "docs", "tools", "proxy",
                 "serve.py", "vercel.json", "__pycache__", "CITATION.cff", "codemeta.json"}

# Navigation, in reading order: (file, label, section heading or None).
NAV = [
    ("index.html", "Overview", "Start here"),
    ("getting-started.html", "Your first test", None),
    ("input-files.html", "Preparing test files", "Using the tool"),
    ("ngl.html", "Loading tests from NGL", None),
    ("results.html", "Reading the results", None),
    ("analysts.html", "Analyst models", None),
    ("downloads.html", "Downloads", None),
    ("method.html", "Metrics and CBT models", "Method"),
    ("symbols.html", "List of symbols", None),
    ("hosting.html", "Running and hosting", "For developers"),
    ("troubleshooting.html", "Troubleshooting and FAQ", "Help"),
    ("citing.html", "Citation and license", None),
]


def version():
    m = re.search(r'TOOL_VERSION\s*=\s*"([^"]+)"', (ROOT / "js" / "export.js").read_text(encoding="utf-8"))
    return m.group(1) if m else "?"


def nav(current):
    out = []
    for file, label, section in NAV:
        if section:
            if out:
                out.append("</ul>")
            out.append(f'<p class="nav-section">{section}</p><ul>')
        cur = ' aria-current="page"' if file == current else ""
        out.append(f'<li><a href="{file}"{cur}>{label}</a></li>')
    out.append("</ul>")
    return "".join(out)


def pager(current):
    i = [f for f, _, _ in NAV].index(current)
    prev = NAV[i - 1] if i > 0 else None
    nxt = NAV[i + 1] if i + 1 < len(NAV) else None
    s = '<nav class="pager" aria-label="Previous and next page">'
    s += f'<a class="prev" href="{prev[0]}"><span>Previous</span>{prev[1]}</a>' if prev else "<span></span>"
    s += f'<a class="next" href="{nxt[0]}"><span>Next</span>{nxt[1]}</a>' if nxt else "<span></span>"
    return s + "</nav>"


def figure(match):
    name, _, caption = (p.strip() for p in match.group(1).partition("|"))
    if not (DOCS / "images" / name).exists():
        raise SystemExit(f"docs/images/{name} not found")
    cap = f"<figcaption>{caption}</figcaption>" if caption else ""
    return (f'<figure class="shot"><a href="images/{name}"><img src="images/{name}" alt="{html.escape(re.sub(r"<[^>]+>", "", caption) or name)}" '
            f'loading="lazy"></a>{cap}</figure>')


def analysts(_):
    models = json.loads((ROOT / "data" / "models.json").read_text(encoding="utf-8"))
    names = {"ru": "r<sub>u,max</sub>", "hull": "Ratio<sub>hull</sub>", "dgamma": "Ratio<sub>Δγ</sub>",
             "kappa": "κ<sub>γ</sub>"}
    rows = []
    for a, m in models["analysts"].items():
        preds = ", ".join(names.get(k, html.escape(k)) for k in m["metrics"])
        rows.append(f"<tr><td>{a}</td><td>{preds}</td></tr>")
    return ('<div class="table-wrap"><table><thead><tr><th>Analyst</th><th>Predictors (besides the intercept)</th>'
            f'</tr></thead><tbody>{"".join(rows)}</tbody></table></div>')


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    # the tool itself, at the root of the site
    OUT.mkdir()
    for p in ROOT.iterdir():
        if p.name in NOT_PUBLISHED:
            continue
        if p.is_dir():
            shutil.copytree(p, OUT / p.name, ignore=shutil.ignore_patterns(".DS_Store", "__pycache__"))
        else:
            shutil.copy2(p, OUT / p.name)
    # the documentation, in docs/
    site = OUT / "docs"
    site.mkdir(parents=True)
    shutil.copytree(DOCS / "assets", site / "assets")
    shutil.copytree(DOCS / "images", site / "images")
    for name in ("Example_1.csv", "Example_2.csv", "Example_3.csv"):
        shutil.copy2(ROOT / "examples" / name, site / name)
    shutil.copy2(ROOT / "template" / "CBT_CDSS_Template.csv", site / "CBT_CDSS_Template.csv")

    layout = (DOCS / "_layout.html").read_text(encoding="utf-8")
    ver = version()
    files = {f for f, _, _ in NAV}
    for page in sorted((DOCS / "pages").glob("*.html")):
        if page.name not in files:
            raise SystemExit(f"{page.name} is not in NAV")
        text = page.read_text(encoding="utf-8")
        title = re.search(r"<!-- title: (.*?) -->", text).group(1)
        desc = re.search(r"<!-- description: (.*?) -->", text).group(1)
        text = re.sub(r"<!-- (title|description): .*? -->\n?", "", text)
        text = re.sub(r"<!-- figure: (.*?) -->", figure, text)
        text = re.sub(r"<!-- analysts -->", analysts, text)
        text = text.replace("<!-- version -->", ver)
        out = (layout.replace("{{title}}", html.escape(f"{title} · CBT Tool documentation"))
               .replace("{{description}}", html.escape(desc))
               .replace("{{nav}}", nav(page.name))
               .replace("{{pager}}", pager(page.name))
               .replace("{{tool}}", TOOL_URL)
               .replace("{{repo}}", REPO_URL)
               .replace("{{version}}", ver)
               .replace("{{content}}", text))
        if "{{" in out:
            raise SystemExit(f"{page.name}: unreplaced placeholder")
        (site / page.name).write_text(out, encoding="utf-8")
    missing = files - {p.name for p in (DOCS / "pages").glob("*.html")}
    if missing:
        raise SystemExit(f"pages in NAV but not in docs/pages/: {sorted(missing)}")
    check_links(site)
    print(f"Built {len(files)} pages into {site.relative_to(ROOT)}/ (tool v{ver} at {OUT.relative_to(ROOT)}/)")


def check_links(site):
    """Fail on links to pages, anchors or files that do not exist in the built site."""
    ids = {p.name: set(re.findall(r'\bid="([^"]+)"', p.read_text(encoding="utf-8"))) for p in site.glob("*.html")}
    bad = []
    for p in site.glob("*.html"):
        for href in re.findall(r'(?:href|src)="([^"]+)"', p.read_text(encoding="utf-8")):
            if re.match(r"(https?:|mailto:|\.\./)", href):
                continue
            target, _, anchor = href.partition("#")
            target = target or p.name
            if not (site / target).exists():
                bad.append(f"{p.name}: {href}")
            elif anchor and target.endswith(".html") and anchor not in ids.get(target, set()):
                bad.append(f"{p.name}: {href} (no such anchor)")
    if bad:
        raise SystemExit("Broken links:\n  " + "\n  ".join(bad))


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT))
        print("Serving http://localhost:8081/docs/  (Ctrl+C to stop)")
        http.server.ThreadingHTTPServer(("", 8081), handler).serve_forever()
