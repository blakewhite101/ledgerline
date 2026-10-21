"""Once-a-day data for the stock pages, heatmap, compare tool, calendar and dividends.

Writes:
  data/stats.json            key stats, analyst ratings, dividends and earnings dates per ticker
  data/history/<TICKER>.json one year of daily closes per ticker (indexes use SPX, DJI, IXIC, RUT)

Standard library only. Yahoo's quoteSummary needs a session cookie and "crumb";
if that handshake fails the history files are still written and stats are left as they were.
"""
import http.cookiejar
import json
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
INDEX_FILES = {"^GSPC": "SPX", "^DJI": "DJI", "^IXIC": "IXIC", "^RUT": "RUT"}
MODULES = "summaryDetail,defaultKeyStatistics,financialData,calendarEvents,recommendationTrend,price"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with opener.open(req, timeout=timeout) as r:
        return r.read()


def crumb():
    try:
        get("https://fc.yahoo.com")
    except Exception:
        pass  # this host answers 404 but still sets the cookie
    try:
        c = get("https://query1.finance.yahoo.com/v1/test/getcrumb").decode().strip()
        return c if c and "<" not in c else None
    except Exception as e:
        print(f"crumb failed: {e}", file=sys.stderr)
        return None


def raw(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    if isinstance(d, dict):
        d = d.get("raw")
    return d


def day(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if isinstance(ts, (int, float)) and ts > 0 else None


def fetch_stats(t, c):
    url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(t.replace('.', '-'))}?modules={MODULES}&crumb={urllib.parse.quote(c)}"
    r = json.loads(get(url))["quoteSummary"]["result"][0]
    sd, ks, fd, ce, pr = (r.get(k, {}) for k in ("summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents", "price"))
    trend = (r.get("recommendationTrend", {}).get("trend") or [{}])[0]
    earn = [day(raw(x)) for x in (ce.get("earnings", {}).get("earningsDate") or []) if isinstance(x, dict)]
    out = {
        "name": pr.get("longName") or pr.get("shortName"),
        "cap": raw(sd, "marketCap") or raw(pr, "marketCap"),
        "pe": raw(sd, "trailingPE"),
        "fpe": raw(sd, "forwardPE"),
        "eps": raw(ks, "trailingEps"),
        "beta": raw(sd, "beta"),
        "hi52": raw(sd, "fiftyTwoWeekHigh"),
        "lo52": raw(sd, "fiftyTwoWeekLow"),
        "divRate": raw(sd, "dividendRate"),
        "divYield": raw(sd, "dividendYield"),
        "exDiv": day(raw(sd, "exDividendDate")),
        "payDate": day(raw(ce, "dividendDate")),
        "earnings": next((e for e in earn if e), None),
        "rec": fd.get("recommendationKey"),
        "recMean": raw(fd, "recommendationMean"),
        "analysts": raw(fd, "numberOfAnalystOpinions"),
        "target": raw(fd, "targetMeanPrice"),
        "ratings": {k: trend.get(k, 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")} if trend else None,
    }
    return {k: v for k, v in out.items() if v not in (None, "", "none")}


def fetch_history(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol.replace('.', '-'))}?range=1y&interval=1d"
    res = json.loads(get(url))["chart"]["result"][0]
    closes = res["indicators"]["quote"][0]["close"]
    return [[day(t), round(c, 4)] for t, c in zip(res["timestamp"], closes) if c is not None]


def main():
    tickers = sorted(json.loads((ROOT / "scripts" / "tickers.json").read_text()))
    (OUT / "history").mkdir(parents=True, exist_ok=True)

    def hist(sym):
        try:
            h = fetch_history(sym)
            (OUT / "history" / f"{INDEX_FILES.get(sym, sym)}.json").write_text(json.dumps(h, separators=(",", ":")))
            return 1
        except Exception as e:
            print(f"history {sym} failed: {e}", file=sys.stderr)
            return 0

    with ThreadPoolExecutor(max_workers=8) as pool:
        n = sum(pool.map(hist, list(INDEX_FILES) + tickers))
    print(f"history: {n} files")

    c = crumb()
    if not c:
        print("stats skipped: no crumb")
        return
    stats = {}

    def one(t):
        try:
            return t, fetch_stats(t, c)
        except Exception as e:
            print(f"stats {t} failed: {e}", file=sys.stderr)
            return t, None

    with ThreadPoolExecutor(max_workers=6) as pool:
        for t, s in pool.map(one, tickers):
            if s:
                stats[t] = s
    if len(stats) > len(tickers) // 2:  # don't replace good data with a mostly failed run
        (OUT / "stats.json").write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(), "stats": stats}, separators=(",", ":")))
    print(f"stats: {len(stats)} tickers")


if __name__ == "__main__":
    main()
