"""Refresh index closes and headlines in index.html.

Run by .github/workflows/update.yml on a schedule. Uses only the standard
library. Each block between <!--NAME--> and <!--/NAME--> markers in
index.html is regenerated; if a source fails, its block is left as is.
"""
import email.utils
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
SITEMAP = ROOT / "sitemap.xml"
UA = {"User-Agent": "Mozilla/5.0 (compatible; LedgerlineBot/1.0)"}

INDEXES = [
    ("^GSPC", "S&P 500", "S&amp;P 500"),
    ("^DJI", "Dow 30", "Dow Jones Industrial Average"),
    ("^IXIC", "Nasdaq", "Nasdaq Composite"),
    ("^RUT", "Russell 2000", "Russell 2000"),
]
FEEDS = [
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Markets"),
]
MAX_NEWS = 10
PER_TICKER_NEWS = 5


def get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_index(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(symbol)}?range=1mo&interval=1d"
    data = json.loads(get(url))
    res = data["chart"]["result"][0]
    meta = res["meta"]
    bars = [(t, c) for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c is not None]
    ts = meta.get("regularMarketTime") or bars[-1][0]
    last = meta.get("regularMarketPrice") or bars[-1][1]
    # Drop the bar for the session the live price belongs to, so prev is the prior close.
    day = datetime.fromtimestamp(ts, timezone.utc).date()
    prior = [c for t, c in bars if datetime.fromtimestamp(t, timezone.utc).date() < day]
    prev = prior[-1]
    week_ago = prior[-5] if len(prior) >= 5 else prior[0]
    return {
        "last": last,
        "chg": last - prev,
        "pct": (last - prev) / prev * 100,
        "wk": (last - week_ago) / week_ago * 100,
        "time": datetime.fromtimestamp(ts, timezone.utc) if ts else None,
    }


def fetch_news():
    items, seen = [], set()
    for source, url in FEEDS:
        try:
            root = ET.fromstring(get(url))
        except Exception as e:  # one bad feed shouldn't stop the others
            print(f"feed {source} failed: {e}", file=sys.stderr)
            continue
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            pub = it.findtext("pubDate")
            if not title or not link.startswith("http"):
                continue
            key = re.sub(r"\W+", "", title.lower())[:60]
            if key in seen:
                continue
            seen.add(key)
            try:
                when = email.utils.parsedate_to_datetime(pub)
                if when.tzinfo is None:
                    when = when.replace(tzinfo=timezone.utc)
            except Exception:
                when = None
            items.append({"title": title, "url": link, "source": source, "when": when})
    items.sort(key=lambda x: x["when"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return items[:MAX_NEWS]


def sign(v, digits=2):
    return ("+" if v > 0 else "−" if v < 0 else "") + f"{abs(v):,.{digits}f}"


def cls(v):
    return "gain" if v >= 0 else "loss"


def bar(v, scale=5.0):
    w = min(abs(v), scale) / scale * 50
    left = 50 if v >= 0 else 50 - w
    return f'<div class="bar {cls(v)}" style="left:{left:.2f}%;width:{w:.2f}%"></div>'


def chart_rows(rows):
    return "".join(
        f'<div class="cr"><span>{name}</span><div class="axis">{bar(v)}</div>'
        f'<span class="val {cls(v)}">{sign(v)}%</span></div>'
        for name, v in rows
    )


def fmt_et(dt):
    # Eastern time without a tz database: EDT (UTC-4) Mar–Nov, else EST.
    off = -4 if 3 <= dt.month <= 10 or (dt.month == 11 and dt.day < 7) else -5
    local = dt.timestamp() + off * 3600
    d = datetime.fromtimestamp(local, timezone.utc)
    return d.strftime("%a, %b ") + str(d.day) + d.strftime(", %Y · ") + d.strftime("%I:%M %p").lstrip("0") + (" EDT" if off == -4 else " EST")


def replace_block(page, name, content):
    pat = re.compile(rf"(<!--{name}-->).*?(<!--/{name}-->)", re.S)
    if not pat.search(page):
        raise SystemExit(f"marker {name} missing from index.html")
    return pat.sub(lambda m: m.group(1) + content + m.group(2), page)


def fetch_quote(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(symbol)}?range=1mo&interval=1d"
    res = json.loads(get(url))["chart"]["result"][0]
    meta = res["meta"]
    bars = [(t, c) for t, c in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c is not None]
    ts = meta.get("regularMarketTime") or bars[-1][0]
    last = meta.get("regularMarketPrice") or bars[-1][1]
    day = datetime.fromtimestamp(ts, timezone.utc).date()
    prior = [c for t, c in bars if datetime.fromtimestamp(t, timezone.utc).date() < day]
    prev = prior[-1] if prior else meta.get("chartPreviousClose") or last
    return {
        "price": round(last, 4),
        "change": round(last - prev, 4),
        "changePct": round((last - prev) / prev * 100, 3),
        "name": meta.get("shortName") or meta.get("longName") or "",
        # Daily closes for the portfolio value chart: [[YYYY-MM-DD, close], ...]
        "hist": [[datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d"), round(c, 4)] for t, c in bars],
    }


def write_portfolio_data(now, news):
    """data/quotes.json and data/news.json feed portfolio.html in visitors' browsers."""
    from concurrent.futures import ThreadPoolExecutor

    sectors = json.loads((ROOT / "scripts" / "tickers.json").read_text())
    out = ROOT / "data"
    out.mkdir(exist_ok=True)

    def one(t):
        try:
            return t, fetch_quote(t.replace(".", "-"))
        except Exception as e:
            print(f"quote {t} failed: {e}", file=sys.stderr)
            return t, None

    with ThreadPoolExecutor(max_workers=8) as pool:
        got = {t: q for t, q in pool.map(one, sorted(sectors)) if q}
    if got:
        for t, q in got.items():
            q["sector"] = sectors[t]
        (out / "quotes.json").write_text(json.dumps({"updatedAt": now.isoformat(), "quotes": got}, separators=(",", ":")))
    if news:
        items = [{"title": n["title"], "url": n["url"], "source": n["source"], "date": n["when"].isoformat() if n["when"] else None} for n in news]
        (out / "news.json").write_text(json.dumps({"updatedAt": now.isoformat(), "news": items}, indent=0))

    # Per-stock headlines for "Top stories for your portfolio".
    def stories(t):
        try:
            root = ET.fromstring(get(f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.request.quote(t.replace('.', '-'))}&region=US&lang=en-US"))
        except Exception as e:
            print(f"news {t} failed: {e}", file=sys.stderr)
            return t, []
        got = []
        for it in list(root.iter("item"))[:PER_TICKER_NEWS]:
            title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
            if not title or not link.startswith("http"):
                continue
            try:
                when = email.utils.parsedate_to_datetime(it.findtext("pubDate")).isoformat()
            except Exception:
                when = None
            got.append({"title": title, "url": link, "date": when})
        return t, got

    with ThreadPoolExecutor(max_workers=8) as pool:
        per = {t: s for t, s in pool.map(stories, sorted(sectors)) if s}
    if per:
        (out / "ticker-news.json").write_text(json.dumps({"updatedAt": now.isoformat(), "news": per}, separators=(",", ":")))


def main():
    page = PAGE.read_text(encoding="utf-8")
    original = page
    now = datetime.now(timezone.utc)

    quotes = {}
    for sym, short, long in INDEXES:
        try:
            quotes[sym] = fetch_index(sym)
        except Exception as e:
            print(f"quote {sym} failed: {e}", file=sys.stderr)

    if len(quotes) == len(INDEXES):
        stamp = max((q["time"] for q in quotes.values() if q["time"]), default=now)
        strip = "".join(
            f'\n    <div class="q"><div class="name">{short}</div><div class="px">{quotes[s]["last"]:,.2f}</div>'
            f'<div class="chg {cls(quotes[s]["chg"])}">{sign(quotes[s]["chg"])} ({sign(quotes[s]["pct"])}%)</div></div>'
            for s, short, _ in INDEXES
        ) + "\n  "
        table = "".join(
            f'\n          <tr><td>{long}</td><td class="r">{quotes[s]["last"]:,.2f}</td>'
            f'<td class="r {cls(quotes[s]["chg"])}">{sign(quotes[s]["chg"])}</td>'
            f'<td class="r"><span class="pill {cls(quotes[s]["pct"])}">{sign(quotes[s]["pct"])}%</span></td></tr>'
            for s, _, long in INDEXES
        ) + "\n        "
        day = sorted(((short, quotes[s]["pct"]) for s, short, _ in INDEXES), key=lambda r: -r[1])
        week = sorted(((short, quotes[s]["wk"]) for s, short, _ in INDEXES), key=lambda r: -r[1])
        chart = (
            '<div class="type">Latest session</div>' + chart_rows(day)
            + '<div class="type" style="margin-top:8px">Past 5 sessions</div>' + chart_rows(week)
        )
        sp, dj, nq = quotes["^GSPC"], quotes["^DJI"], quotes["^IXIC"]
        ups = sum(1 for q in (sp, dj, nq) if q["pct"] >= 0)
        mood = "Stocks rise" if ups == 3 else "Stocks fall" if ups == 0 else "Stocks are mixed"
        leader = max(((n, quotes[s]["pct"]) for s, n, _ in INDEXES), key=lambda r: r[1])
        laggard = min(((n, quotes[s]["pct"]) for s, n, _ in INDEXES), key=lambda r: r[1])
        recap = (
            f'\n      <div class="eyebrow">Market snapshot · {fmt_et(stamp)}</div>'
            f"\n      <h1>{mood}: S&amp;P 500 {sign(sp['pct'])}%, Dow {sign(dj['pct'])}%, Nasdaq {sign(nq['pct'])}%</h1>"
            f'\n      <p class="lede">The {leader[0].replace("&", "&amp;")} led at {sign(leader[1])}% while the {laggard[0].replace("&", "&amp;")} '
            f'{"trailed" if laggard[1] >= 0 else "lagged"} at {sign(laggard[1])}%. Over the past five sessions the S&amp;P 500 is '
            f"{sign(sp['wk'])}% and the Nasdaq {sign(nq['wk'])}%.</p>"
            f'\n      <div class="byline">Prices update every 30 minutes during market hours.</div>\n    '
        )
        page = replace_block(page, "QUOTES", strip)
        page = replace_block(page, "TABLE", table)
        page = replace_block(page, "CHART", chart)
        page = replace_block(page, "RECAP", recap)

    news = fetch_news()
    if news:
        lis = "".join(
            f'\n        <li><div class="src">{html.escape(n["source"])}'
            + (f' · {n["when"].strftime("%b ")}{n["when"].day}' if n["when"] else "")
            + f'</div><a href="{html.escape(n["url"], quote=True)}" rel="noopener">{html.escape(n["title"])}</a></li>'
            for n in news
        ) + "\n      "
        page = replace_block(page, "NEWS", lis)

    write_portfolio_data(now, news)

    if page != original:
        page = replace_block(page, "UPDATED", f"Updated {fmt_et(now)}")
        PAGE.write_text(page, encoding="utf-8")
        sm = SITEMAP.read_text(encoding="utf-8")
        SITEMAP.write_text(re.sub(r"<lastmod>.*?</lastmod>", f"<lastmod>{now:%Y-%m-%d}</lastmod>", sm), encoding="utf-8")
        print("index.html updated")
    else:
        print("no changes")


if __name__ == "__main__":
    main()
