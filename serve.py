#!/usr/bin/env python3
"""Serve the CBT tool locally and relay /ngl/... to the NGL REST API.

    python serve.py            # then open http://localhost:8000
    python serve.py 8080       # other port

Browsers only let a web page call another site's API if that site allows it
(CORS). The relay makes the NGL API appear on the same address as the tool, so
signing in and loading NGL tests works locally whatever NGL's CORS settings are.
Only the NGL token and API endpoints are relayed; nothing is logged or stored.
"""
import http.server
import json
import os
import re
import sys
import urllib.error
import urllib.request

NGL = os.environ.get("NGL_URL", "https://nextgenerationliquefaction.org").rstrip("/")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) 134.0.6998.118 Safari/537.36")
ALLOWED = re.compile(r"^/(users/api-token|[a-z0-9-]+/api-index)$")
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _relay(self):
        path, _, query = self.path[len("/ngl"):].partition("?")
        if not ALLOWED.match(path):
            return self.send_error(404)
        body = None
        if self.command == "POST":
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        req = urllib.request.Request(NGL + path + ("?" + query if query else ""), data=body, method=self.command)
        for h in ("Authorization", "Accept", "Content-Type"):
            if self.headers.get(h):
                req.add_header(h, self.headers[h])
        req.add_header("User-Agent", UA)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                status, data, ctype = r.status, r.read(), r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:   # pass NGL's error (e.g. 400 + errorMessage) through
            status, data, ctype = e.code, e.read(), e.headers.get("Content-Type", "application/json")
        except Exception as e:  # noqa: BLE001
            status, data, ctype = 502, json.dumps({"errorMessage": f"Relay could not reach NGL: {e}"}).encode(), "application/json"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/ngl/"):
            return self._relay()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/ngl/"):
            return self._relay()
        self.send_error(405)

    def log_message(self, fmt, *args):   # keep the console quiet; never print tokens
        if not self.path.startswith("/ngl/"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"CBT tool: http://localhost:{port}   (NGL relay -> {NGL})")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
