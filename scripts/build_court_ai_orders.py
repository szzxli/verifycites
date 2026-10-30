"""Render data/court-ai-orders.json into the static table on legal/index.html.

The JSON file is the only source. This script copies it into the page
between the COURT-AI-ORDERS markers so the table is readable without
JavaScript. It never changes last_reviewed; that date is set by hand.
Run: python3 scripts/build_court_ai_orders.py  (add --check to verify only)
"""
import html
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data", "court-ai-orders.json")
PAGE = os.path.join(ROOT, "legal", "index.html")
START = "<!-- COURT-AI-ORDERS:START (generated from data/court-ai-orders.json) -->"
END = "<!-- COURT-AI-ORDERS:END -->"


def is_official(url):
    host = url.split("/")[2] if url.startswith("https://") else ""
    return host.endswith(".uscourts.gov")


def render(data):
    e = lambda s: html.escape(s, quote=True)
    out = [START]
    out.append('        <p id="court-ai-orders-scope" class="court-orders-scope">%s</p>' % e(data["scope"]))
    out.append('        <p id="court-ai-orders-note">%s</p>' % e(data["note"]))
    out.append('        <p id="court-ai-orders-reviewed">Last reviewed: <time datetime="%s">%s</time></p>'
               % (e(data["last_reviewed"]), e(data["last_reviewed"])))
    out.append('        <p id="court-ai-orders-stale" class="news-stale" hidden></p>')
    out.append('        <div class="table-wrap">')
    out.append('          <table class="data-table court-orders-table">')
    out.append('            <thead><tr><th scope="col">Court</th><th scope="col">Judge</th>'
               '<th scope="col">Effective date</th><th scope="col">Requirement (one-sentence summary)</th>'
               '<th scope="col">Official source</th></tr></thead>')
    out.append('            <tbody>')
    for r in data["rows"]:
        if not is_official(r["source"]):
            raise SystemExit("not an official .uscourts.gov source: " + r["source"])
        out.append('              <tr><td data-label="Court">%s</td><td data-label="Judge">%s</td>'
                   '<td data-label="Effective date">%s</td><td data-label="Requirement">%s</td>'
                   '<td data-label="Official source"><a href="%s" target="_blank" rel="noopener noreferrer">Official source ↗</a></td></tr>'
                   % (e(r["court"]), e(r["judge"]), e(r["effective"]), e(r["summary"]), e(r["source"])))
    out.append('            </tbody>')
    out.append('          </table>')
    out.append('        </div>')
    out.append('        ' + END)
    return "\n".join(out)


def main():
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    with open(PAGE, encoding="utf-8") as f:
        page = f.read()
    a, b = page.index(START), page.index(END) + len(END)
    new = page[:a] + render(data) + page[b:]
    if "--check" in sys.argv:
        if new != page:
            raise SystemExit("legal/index.html is out of date; run python3 scripts/build_court_ai_orders.py")
        print("court AI orders table is up to date")
        return
    with open(PAGE, "w", encoding="utf-8") as f:
        f.write(new)
    print("wrote %d rows" % len(data["rows"]))


if __name__ == "__main__":
    main()
