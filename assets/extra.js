// Command bar, stock pages, heatmap, watchlist and alerts, compare, calendar and dividends.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n, sign) {
    var v = Number(n) || 0, s = Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return sign ? (v > 0 ? "+" : v < 0 ? "−" : "") + s : (v < 0 ? "−" : "") + s;
  };
  var pct = function (n, d) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d == null ? 2 : d) + "%"; };
  var cls = function (n) { return n > 0 ? "gain" : n < 0 ? "loss" : ""; };
  var big = function (n) { if (n == null) return "—"; var a = Math.abs(n); return a >= 1e12 ? "$" + (n / 1e12).toFixed(2) + "T" : a >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : a >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : money(n); };
  var fmtDay = function (d, y) { if (!d) return "—"; var t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString("en-US", y ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" }); };
  var today = new Date().toISOString().slice(0, 10);
  var Store = window.LedgerlineStore;
  var cache = {};
  var getJSON = function (url) { if (!cache[url]) cache[url] = fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); return cache[url]; };
  var Q = function () { return getJSON("data/quotes.json").then(function (d) { return (d && d.quotes) || {}; }); };
  var S = function () { return getJSON("data/stats.json").then(function (d) { return (d && d.stats) || {}; }); };
  var H = function (t) { return getJSON("data/history/" + encodeURIComponent(t) + ".json"); };
  var clean = function (t) { return String(t || "").trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, ""); };
  var param = function (k) { return new URLSearchParams(location.search).get(k); };
  var userReady = function () { return Store.ready().then(function (st) { return st.mode === "local" || !!st.user; }); };

  /* ---------------- line chart (stock page, compare, sparklines) ---------------- */
  // series: [{name, color, pts: [[date, value]]}]; fmt formats y labels.
  function lineChart(el, series, fmt, opts) {
    opts = opts || {};
    var W = Math.max(280, Math.round(el.clientWidth || 700)), Hh = opts.height || 240, L = 4, R = opts.spark ? 4 : 64, T = 10, B = opts.spark ? 4 : 24;
    var all = []; series.forEach(function (s) { s.pts.forEach(function (p) { all.push(p[1]); }); });
    if (!all.length) { el.innerHTML = ""; return; }
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.02 || 1; lo -= pad; hi += pad;
    var n = Math.max.apply(null, series.map(function (s) { return s.pts.length; }));
    var x = function (i) { return L + (i / Math.max(1, n - 1)) * (W - L - R); };
    var y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (Hh - T - B); };
    var out = "";
    if (!opts.spark) {
      [0, 1, 2, 3].forEach(function (k) { var v = lo + (hi - lo) * (k + 0.5) / 4; out += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="ax" x="' + (W - R + 8) + '" y="' + (y(v) + 4).toFixed(1) + '">' + fmt(v) + "</text>"; });
      var ref = series[0].pts, mid = Math.floor((ref.length - 1) / 2);
      [0, mid, ref.length - 1].forEach(function (i, k) { out += '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (Hh - 6) + '" text-anchor="' + (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + fmtDay(ref[i][0], opts.years) + "</text>"; });
      if (opts.zero) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".6"/>';
    }
    series.forEach(function (s, si) {
      var d = s.pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
      if (series.length === 1 && !opts.spark) {
        var gid = "g" + Math.random().toString(36).slice(2, 7);
        out += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".2"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient></defs>';
        out += '<path d="' + d + " L" + x(s.pts.length - 1).toFixed(1) + " " + (Hh - B) + " L" + x(0) + " " + (Hh - B) + ' Z" fill="url(#' + gid + ')"/>';
      }
      out += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="' + (opts.spark ? 1.6 : 2.2) + '" stroke-linejoin="round"/>';
      if (!opts.spark) { var lp = s.pts[s.pts.length - 1]; out += '<circle cx="' + x(s.pts.length - 1).toFixed(1) + '" cy="' + y(lp[1]).toFixed(1) + '" r="3.5" fill="' + s.color + '"/>'; }
    });
    el.innerHTML = '<svg viewBox="0 0 ' + W + " " + Hh + '" width="' + (opts.spark ? W : "100%") + '" height="' + Hh + '" role="img" aria-label="' + esc(opts.label || "Price chart") + '">' + out + "</svg>";
  }
  var upCol = function (pts) { return pts.length && pts[pts.length - 1][1] >= pts[0][1] ? "#12b76a" : "#f04438"; };
  var slice = function (pts, range) { var days = { "1M": 22, "3M": 64, "6M": 127, "1Y": 260 }[range] || 260; return pts.slice(-days); };
  // History file if the daily job has run, otherwise the month of closes in quotes.json.
  var priceHistory = function (t, q) { return H(t).then(function (h) { return (h && h.length) ? h : ((q && q.hist) || []); }); };

  /* ---------------- command bar (every page) ---------------- */
  var NAV = { HOME: "./", MKT: "./", MARKETS: "./", HEAT: "heatmap.html", HEATMAP: "heatmap.html", MAP: "heatmap.html", WATCH: "watchlist.html", W: "watchlist.html", WATCHLIST: "watchlist.html", ALERTS: "watchlist.html#alerts", PORT: "portfolio.html", P: "portfolio.html", PORTFOLIO: "portfolio.html", DIV: "portfolio.html#dividends", DIVIDENDS: "portfolio.html#dividends", CAL: "calendar.html", CALENDAR: "calendar.html", OIL: "tankers.html", TANKER: "tankers.html", TANKERS: "tankers.html", SHIPS: "tankers.html", ECO: "calendar.html", NOTES: "notes.html", N: "notes.html", CMP: "compare.html", COMPARE: "compare.html", HELP: "#cmdhelp" };
  function runCommand(raw) {
    var words = raw.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!words.length) return;
    var w0 = words[0], rest = words.slice(1).map(clean).filter(Boolean);
    if ((w0 === "CMP" || w0 === "COMPARE") && rest.length) return void (location.href = "compare.html?s=" + rest.slice(0, 5).join(","));
    if (w0 === "NEWS" && rest.length) return void (location.href = "stock.html?s=" + rest[0] + "#news");
    if (w0 === "ALERT" && rest.length) return void (location.href = "watchlist.html?alert=" + rest[0] + "#alerts");
    if (w0 === "HELP" || w0 === "?") { var h = $("cmdhelp"); if (h) h.hidden = !h.hidden; return; }
    if (NAV[w0]) return void (location.href = NAV[w0]);
    if (words.length === 2 && NAV[words[1]] === undefined && /^(GP|CHART|DES|Q)$/.test(words[1])) return void (location.href = "stock.html?s=" + clean(w0));
    location.href = "stock.html?s=" + clean(w0);
  }
  if ($("cmd")) {
    var cmd = $("cmd");
    cmd.closest("form").addEventListener("submit", function (e) { e.preventDefault(); runCommand(cmd.value); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); cmd.focus(); cmd.select(); }
    });
    cmd.addEventListener("focus", function () {
      Q().then(function (q) { var dl = $("cmdlist"); if (dl && !dl.options.length) dl.innerHTML = Object.keys(q).sort().map(function (t) { return '<option value="' + t + '">' + esc(q[t].name || "") + "</option>"; }).join(""); });
    }, { once: true });
  }

  /* ---------------- price alerts (checked on every page) ---------------- */
  function toast(msg) {
    var box = $("toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    var t = document.createElement("div"); t.className = "toast"; t.innerHTML = msg + '<button class="btn ghost small" aria-label="Dismiss">✕</button>';
    t.querySelector("button").addEventListener("click", function () { t.remove(); });
    box.appendChild(t);
  }
  var hit = function (a, q) { if (!q) return false; return a.kind === "above" ? q.price >= a.value : a.kind === "below" ? q.price <= a.value : Math.abs(q.changePct) >= a.value; };
  var alertText = function (a) { return a.kind === "above" ? "rises above " + money(a.value) : a.kind === "below" ? "falls below " + money(a.value) : "moves more than " + a.value + "% in a day"; };
  userReady().then(function (ok) {
    if (!ok) return;
    return Promise.all([Store.getAlerts(), Q()]).then(function (r) {
      r[0].filter(function (a) { return !a.triggeredAt && hit(a, r[1][a.ticker]); }).forEach(function (a) {
        var q = r[1][a.ticker];
        Store.markAlert(a.id).catch(function () {});
        var msg = a.ticker + " " + alertText(a) + ": now " + money(q.price) + " (" + pct(q.changePct) + ")";
        toast('<span><strong>Price alert.</strong> <a href="stock.html?s=' + encodeURIComponent(a.ticker) + '">' + esc(msg) + "</a></span>");
        try { if (window.Notification && Notification.permission === "granted") new Notification("Ledgerline price alert", { body: msg }); } catch (e) {}
      });
    });
  }).catch(function () {});

  /* ---------------- stock detail page ---------------- */
  if ($("stock-page")) {
    var T = clean(param("s")) || "AAPL", range = "1Y";
    document.title = T + " stock price, chart, stats and news | Ledgerline";
    Promise.all([Q(), S(), getJSON("data/ticker-news.json")]).then(function (r) {
      var q = r[0][T], st = r[1][T] || {}, news = (r[2] && r[2].news && r[2].news[T]) || [];
      var name = st.name || (q && q.name) || T;
      $("s-name").textContent = name; $("s-tk").textContent = T + (q && q.sector ? " · " + q.sector : "");
      $("s-yahoo").href = "https://finance.yahoo.com/quote/" + encodeURIComponent(T);
      if (!q) {
        $("s-price").textContent = "—";
        $("s-body").innerHTML = '<div class="empty"><strong>Ledgerline doesn\'t track ' + esc(T) + " yet</strong>We cover about 280 of the largest US stocks and ETFs. You can still see it on " + '<a href="https://finance.yahoo.com/quote/' + encodeURIComponent(T) + '" target="_blank" rel="noopener">Yahoo Finance</a>.</div>';
        return;
      }
      $("s-price").textContent = money(q.price);
      $("s-chg").textContent = money(q.change, true) + " (" + pct(q.changePct) + ") today"; $("s-chg").className = "move " + cls(q.change);

      priceHistory(T, q).then(function (pts) {
        var draw = function () {
          var p = slice(pts, range), ch = p.length ? p[p.length - 1][1] - p[0][1] : 0;
          lineChart($("s-chart"), [{ name: T, color: upCol(p), pts: p }], function (v) { return money(v).replace(/\.\d\d$/, ""); }, { label: T + " price", years: range === "1Y" });
          $("s-range").innerHTML = range + ' <span class="' + cls(ch) + '">' + money(ch, true) + " (" + pct(p.length ? (ch / p[0][1]) * 100 : 0) + ")</span>";
          document.querySelectorAll("#s-ranges button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.r === range)); });
        };
        if (pts.length < 30) document.querySelectorAll("#s-ranges button").forEach(function (b) { if (b.dataset.r !== "1M") b.hidden = true; }), range = "1M";
        $("s-ranges").addEventListener("click", function (e) { var b = e.target.closest("button[data-r]"); if (b) { range = b.dataset.r; draw(); } });
        draw(); window.addEventListener("resize", draw);
      });

      var stat = function (k, v) { return '<div class="kv"><span>' + k + "</span><b>" + v + "</b></div>"; };
      var lo = st.lo52, hi = st.hi52;
      $("s-stats").innerHTML = Object.keys(st).length ? [
        stat("Market cap", big(st.cap)), stat("P/E (trailing)", st.pe ? st.pe.toFixed(1) : "—"), stat("P/E (forward)", st.fpe ? st.fpe.toFixed(1) : "—"), stat("EPS", st.eps != null ? money(st.eps) : "—"),
        stat("Dividend yield", st.divYield ? (st.divYield * 100).toFixed(2) + "%" : "None"), stat("Dividend / share", st.divRate ? money(st.divRate) + " a year" : "—"),
        stat("Ex-dividend date", fmtDay(st.exDiv, 1)), stat("Next earnings", fmtDay(st.earnings, 1)),
        stat("52-week range", lo && hi ? money(lo) + " – " + money(hi) : "—"), stat("Beta", st.beta ? st.beta.toFixed(2) : "—")
      ].join("") + (lo && hi ? '<div class="rangebar"><span style="left:' + Math.max(0, Math.min(100, ((q.price - lo) / (hi - lo)) * 100)).toFixed(1) + '%"></span></div><div class="meta" style="justify-content:space-between"><span>52-week low</span><span>52-week high</span></div>' : "")
        : '<div class="empty"><strong>Key stats load once a day</strong>P/E, dividends and earnings dates appear after the site\'s daily data job runs.</div>';

      var rt = st.ratings, tot = rt ? rt.strongBuy + rt.buy + rt.hold + rt.sell + rt.strongSell : 0;
      var REC = { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell" };
      $("s-analysts").innerHTML = tot ? '<div class="consensus"><div><div class="k">Consensus</div><div class="v">' + esc(REC[st.rec] || "—") + '</div></div><div><div class="k">Mean target</div><div class="v">' + (st.target ? money(st.target) : "—") + "</div>" + (st.target ? '<div class="' + cls(st.target - q.price) + '">' + pct(((st.target - q.price) / q.price) * 100, 1) + " from today</div>" : "") + '</div><div><div class="k">Analysts</div><div class="v">' + (st.analysts || tot) + "</div></div></div>" +
        '<div class="ratebar">' + [["strongBuy", "Strong buy", "#079455"], ["buy", "Buy", "#47cd89"], ["hold", "Hold", "#fdb022"], ["sell", "Sell", "#f97066"], ["strongSell", "Strong sell", "#d92d20"]].map(function (k) { return rt[k[0]] ? '<span style="flex:' + rt[k[0]] + ";background:" + k[2] + '" title="' + k[1] + ": " + rt[k[0]] + '"></span>' : ""; }).join("") + "</div>" +
        '<div class="ratelegend">' + [["strongBuy", "Strong buy", "#079455"], ["buy", "Buy", "#47cd89"], ["hold", "Hold", "#fdb022"], ["sell", "Sell", "#f97066"], ["strongSell", "Strong sell", "#d92d20"]].map(function (k) { return '<span><i style="background:' + k[2] + '"></i>' + k[1] + " " + rt[k[0]] + "</span>"; }).join("") + "</div>"
        : '<div class="empty"><strong>No analyst ratings yet</strong>Ratings appear after the site\'s daily data job runs.</div>';

      $("news").innerHTML = news.length ? news.map(function (n) { return '<li><div class="src">' + (n.date ? fmtDay(n.date.slice(0, 10)) : "") + '</div><a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.title) + "</a></li>"; }).join("")
        : '<li class="empty"><strong>No recent headlines</strong>Stock news appears once the site\'s news feed is running.</li>';
      if (location.hash === "#news") $("news").scrollIntoView();
    });

    var wbtn = $("s-watch");
    userReady().then(function (ok) {
      if (!ok) { wbtn.textContent = "Sign in to watch"; wbtn.addEventListener("click", function () { location.href = "login.html?next=stock.html"; }); return; }
      return Store.getWatchlist().then(function (w) {
        var on = w.some(function (x) { return x.ticker === T; });
        var set = function () { wbtn.textContent = on ? "✓ Watching" : "+ Watchlist"; wbtn.className = on ? "btn small" : "btn primary small"; };
        set();
        wbtn.addEventListener("click", function () { (on ? Store.removeWatch(T) : Store.addWatch(T)).then(function () { on = !on; set(); }); });
      });
    });
    $("s-alert").href = "watchlist.html?alert=" + encodeURIComponent(T) + "#alerts";
  }

  /* ---------------- heatmap ---------------- */
  // Squarified treemap: lays out [{value}] in a w×h box.
  function squarify(items, x, y, w, h) {
    var out = [], rest = items.slice(), total = rest.reduce(function (a, b) { return a + b.value; }, 0);
    var worst = function (row, len, scale) { var s = 0, mx = 0, mn = Infinity; row.forEach(function (r) { var a = r.value * scale; s += a; mx = Math.max(mx, a); mn = Math.min(mn, a); }); return Math.max(len * len * mx / (s * s), (s * s) / (len * len * mn)); };
    while (rest.length) {
      var scale = (w * h) / total, len = Math.min(w, h), row = [rest[0]], i = 1;
      while (i < rest.length && worst(row.concat([rest[i]]), len, scale) <= worst(row, len, scale)) { row.push(rest[i]); i++; }
      var rs = row.reduce(function (a, b) { return a + b.value; }, 0) * scale, thick = rs / len, off = 0;
      row.forEach(function (r) { var a = r.value * scale, l = a / thick; out.push(w >= h ? { item: r, x: x, y: y + off, w: thick, h: l } : { item: r, x: x + off, y: y, w: l, h: thick }); off += l; });
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      total -= row.reduce(function (a, b) { return a + b.value; }, 0); rest = rest.slice(row.length);
    }
    return out;
  }
  var heatColor = function (p) { var k = Math.min(1, Math.abs(p) / 3); if (p >= 0) return "rgb(" + Math.round(40 - 30 * k) + "," + Math.round(120 + 60 * k) + "," + Math.round(80 - 20 * k) + ")"; return "rgb(" + Math.round(150 + 90 * k) + "," + Math.round(60 - 30 * k) + "," + Math.round(60 - 30 * k) + ")"; };
  if ($("heatmap")) {
    var hmFilter = "stocks";
    var drawHeat = function () {
      Promise.all([Q(), S()]).then(function (r) {
        var q = r[0], st = r[1], el = $("heatmap"), W = el.clientWidth || 900, Hh = Math.max(420, Math.round(W * 0.62));
        var bySec = {}, sized = 0;
        Object.keys(q).forEach(function (t) {
          var it = q[t]; if (hmFilter === "stocks" ? it.sector === "ETF / Fund" : it.sector !== "ETF / Fund") return;
          var cap = st[t] && st[t].cap; if (cap) sized++;
          (bySec[it.sector] = bySec[it.sector] || []).push({ t: t, p: Number(it.changePct) || 0, value: cap || 1, name: it.name });
        });
        var secs = Object.keys(bySec).map(function (s) { var items = bySec[s].sort(function (a, b) { return b.value - a.value; }); return { name: s, items: items, value: items.reduce(function (a, b) { return a + b.value; }, 0) }; }).sort(function (a, b) { return b.value - a.value; });
        if (!secs.length) { el.innerHTML = '<div class="empty"><strong>The heatmap appears once prices load</strong>It colors each stock by today\'s move, using the site\'s price feed.</div>'; el.style.height = "auto"; return; }
        el.style.height = Hh + "px";
        var html = "";
        squarify(secs, 0, 0, W, Hh).forEach(function (s) {
          html += '<div class="hm-sec" style="left:' + s.x + "px;top:" + s.y + "px;width:" + s.w + "px;height:" + s.h + 'px"><div class="hm-sl">' + esc(s.item.name) + "</div></div>";
          squarify(s.item.items, s.x + 1, s.y + 16, Math.max(0, s.w - 2), Math.max(0, s.h - 17)).forEach(function (c) {
            var show = c.w > 34 && c.h > 22, big2 = c.w > 70 && c.h > 44;
            html += '<a class="hm-cell" href="stock.html?s=' + encodeURIComponent(c.item.t) + '" title="' + esc(c.item.t + " " + (c.item.name || "") + " " + pct(c.item.p)) + '" style="left:' + c.x + "px;top:" + c.y + "px;width:" + c.w + "px;height:" + c.h + "px;background:" + heatColor(c.item.p) + '">' + (show ? '<b style="font-size:' + (big2 ? 14 : 11) + 'px">' + esc(c.item.t) + "</b>" + (big2 ? "<span>" + pct(c.item.p) + "</span>" : "") : "") + "</a>";
          });
        });
        el.innerHTML = html;
        $("hm-note").textContent = sized ? "Tile size is company value (market cap). Color is today's change." : "Tiles are equal size until the daily data job adds company values. Color is today's change.";
      });
    };
    $("hm-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-f]"); if (!b) return; hmFilter = b.dataset.f; document.querySelectorAll("#hm-tabs button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); drawHeat(); });
    drawHeat(); var hr; window.addEventListener("resize", function () { clearTimeout(hr); hr = setTimeout(drawHeat, 150); });
    Q().then(function (q) {
      var all = Object.keys(q).map(function (t) { return { t: t, p: q[t].changePct, name: q[t].name }; }).filter(function (x) { return x.p != null; }).sort(function (a, b) { return b.p - a.p; });
      var li = function (x) { return '<li><a href="stock.html?s=' + encodeURIComponent(x.t) + '"><b>' + esc(x.t) + "</b> <span>" + esc(x.name || "") + '</span></a><span class="pill ' + cls(x.p) + '">' + pct(x.p) + "</span></li>"; };
      $("gainers").innerHTML = all.length ? all.slice(0, 6).map(li).join("") : '<li class="meta">Movers appear once prices load.</li>';
      $("losers").innerHTML = all.length ? all.slice(-6).reverse().map(li).join("") : '<li class="meta">Movers appear once prices load.</li>';
    });
  }

  /* ---------------- watchlist and alerts ---------------- */
  if ($("watch-page")) {
    var wl = [], alerts = [], wq = {}, wst = {};
    var drawWatch = function () {
      $("wl").innerHTML = wl.length ? '<div class="tablewrap"><table><thead><tr><th>Symbol</th><th>1 month</th><th class="r">Price</th><th class="r">Today</th><th class="r">52-week range</th><th></th></tr></thead><tbody>' + wl.map(function (w) {
        var q = wq[w.ticker], st = wst[w.ticker] || {};
        return '<tr><td><a href="stock.html?s=' + encodeURIComponent(w.ticker) + '"><b>' + esc(w.ticker) + '</b></a><div class="meta">' + esc((q && q.name) || "") + '</div></td><td><div class="spark" data-t="' + esc(w.ticker) + '"></div></td>' +
          '<td class="r">' + (q ? money(q.price) : "—") + '</td><td class="r">' + (q ? '<span class="pill ' + cls(q.changePct) + '">' + pct(q.changePct) + "</span>" : "—") + "</td>" +
          '<td class="r">' + (st.lo52 && st.hi52 ? money(st.lo52) + " – " + money(st.hi52) : "—") + '</td><td class="r"><div class="acts"><a class="btn ghost small" href="#alerts" data-alert="' + esc(w.ticker) + '">Alert</a><button class="btn ghost danger small" data-unwatch="' + esc(w.ticker) + '">Remove</button></div></td></tr>';
      }).join("") + "</tbody></table></div>" : '<div class="empty"><strong>Your watchlist is empty</strong>Add stocks you want to follow without owning them. Type a ticker above, or press "+ Watchlist" on any stock page.</div>';
      document.querySelectorAll(".spark").forEach(function (el) { var p = (wq[el.dataset.t] && wq[el.dataset.t].hist) || []; if (p.length > 1) lineChart(el, [{ color: upCol(p), pts: p }], String, { spark: true, height: 36, label: el.dataset.t + " past month" }); else el.innerHTML = '<span class="meta">—</span>'; });
      $("al").innerHTML = alerts.length ? alerts.map(function (a) {
        var q = wq[a.ticker];
        return '<div class="alrow"><div><b>' + esc(a.ticker) + "</b> " + esc(alertText(a)) + '<div class="meta">' + (a.triggeredAt ? '<span class="chip">Triggered ' + fmtDay(a.triggeredAt.slice(0, 10)) + "</span>" : "Waiting") + (q ? " · now " + money(q.price) : "") + '</div></div><button class="btn ghost danger small" data-delalert="' + esc(a.id) + '">Delete</button></div>';
      }).join("") : '<div class="empty"><strong>No alerts yet</strong>Set a price or a daily move, and Ledgerline flags it when you open the site.</div>';
    };
    var loadAll = function () { return Promise.all([Store.getWatchlist(), Store.getAlerts(), Q(), S()]).then(function (r) { wl = r[0]; alerts = r[1]; wq = r[2]; wst = r[3]; drawWatch(); }); };
    var fail = function (err) { $("w-status").textContent = err.message; $("w-status").className = "status err"; };
    userReady().then(function (ok) { if (!ok) { location.replace("login.html?next=watchlist.html"); return; } return loadAll(); }).catch(fail);
    $("addwatch").addEventListener("submit", function (e) { e.preventDefault(); var t = clean($("w-ticker").value); if (!t) return; Store.addWatch(t).then(function () { $("w-ticker").value = ""; $("w-status").textContent = "Added " + t + "."; $("w-status").className = "status"; return loadAll(); }, fail); });
    $("wl").addEventListener("click", function (e) {
      var b = e.target.closest("[data-unwatch]"); if (b) Store.removeWatch(b.dataset.unwatch).then(loadAll, fail);
      var a = e.target.closest("[data-alert]"); if (a) { $("a-ticker").value = a.dataset.alert; $("a-value").focus(); }
    });
    $("al").addEventListener("click", function (e) { var b = e.target.closest("[data-delalert]"); if (b) Store.deleteAlert(b.dataset.delalert).then(loadAll, fail); });
    $("a-kind").addEventListener("change", function () { $("a-value").placeholder = $("a-kind").value === "move" ? "Percent, e.g. 5" : "Price, e.g. 200"; });
    $("addalert").addEventListener("submit", function (e) {
      e.preventDefault(); var t = clean($("a-ticker").value), v = parseFloat($("a-value").value);
      if (!t || isNaN(v)) { fail(new Error("Enter a ticker and a number.")); return; }
      Store.addAlert({ ticker: t, kind: $("a-kind").value, value: v }).then(function () { $("addalert").reset(); $("w-status").textContent = "Alert saved for " + t + "."; $("w-status").className = "status"; return loadAll(); }, fail);
    });
    if (param("alert")) $("a-ticker").value = clean(param("alert"));
    var nb = $("notify");
    if (!window.Notification) nb.hidden = true;
    else { var setNb = function () { nb.textContent = Notification.permission === "granted" ? "✓ Notifications on" : "Turn on notifications"; nb.disabled = Notification.permission !== "default"; }; setNb(); nb.addEventListener("click", function () { Notification.requestPermission().then(setNb); }); }
  }

  /* ---------------- compare ---------------- */
  if ($("compare-page")) {
    var PALETTE = ["#3e5bf2", "#ee46bc", "#f79009", "#16b364", "#7a5af8"], crange = "1Y";
    var tick = (param("s") || "AAPL,MSFT").split(",").map(clean).filter(Boolean).slice(0, 5);
    $("c-input").value = tick.join(", ");
    var drawCmp = function () {
      var syms = tick.slice(), withIdx = $("c-spx").checked;
      Q().then(function (q) {
        return Promise.all(syms.map(function (t) { return priceHistory(t, q[t]); }).concat(withIdx ? [H("SPX")] : [])).then(function (hs) {
          var series = [];
          syms.forEach(function (t, i) { var p = slice(hs[i] || [], crange); if (p.length > 1) series.push({ name: t, color: PALETTE[i % 5], pts: p.map(function (x) { return [x[0], (x[1] / p[0][1] - 1) * 100]; }) }); });
          if (withIdx && hs[syms.length] && hs[syms.length].length > 1) { var sp = slice(hs[syms.length], crange); series.push({ name: "S&P 500", color: "#98a2b3", pts: sp.map(function (x) { return [x[0], (x[1] / sp[0][1] - 1) * 100]; }) }); }
          if (!series.length) { $("c-chart").innerHTML = '<div class="empty"><strong>The comparison chart appears once prices load</strong>It uses daily prices from the site\'s price feed.</div>'; $("c-table").innerHTML = ""; return; }
          lineChart($("c-chart"), series, function (v) { return pct(v, 0); }, { zero: true, height: 300, years: crange === "1Y", label: "Percent change comparison" });
          $("c-legend").innerHTML = series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + "</span>"; }).join("");
          $("c-table").innerHTML = '<div class="tablewrap"><table><thead><tr><th>Symbol</th><th class="r">Price</th><th class="r">Today</th><th class="r">' + crange + ' return</th></tr></thead><tbody>' + series.map(function (s) {
            var last = s.pts[s.pts.length - 1][1], qq = q[s.name];
            return '<tr><td><i class="dot" style="background:' + s.color + '"></i> ' + (qq ? '<a href="stock.html?s=' + encodeURIComponent(s.name) + '"><b>' + esc(s.name) + "</b></a>" : "<b>" + esc(s.name) + "</b>") + '</td><td class="r">' + (qq ? money(qq.price) : "—") + '</td><td class="r">' + (qq ? '<span class="pill ' + cls(qq.changePct) + '">' + pct(qq.changePct) + "</span>" : "—") + '</td><td class="r ' + cls(last) + '">' + pct(last) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        });
      });
      document.querySelectorAll("#c-ranges button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.r === crange)); });
    };
    $("c-form").addEventListener("submit", function (e) { e.preventDefault(); tick = $("c-input").value.split(/[\s,]+/).map(clean).filter(Boolean).slice(0, 5); window.history.replaceState(null, "", "?s=" + tick.join(",")); drawCmp(); });
    $("c-spx").addEventListener("change", drawCmp);
    $("c-ranges").addEventListener("click", function (e) { var b = e.target.closest("button[data-r]"); if (b) { crange = b.dataset.r; drawCmp(); } });
    drawCmp(); var cr; window.addEventListener("resize", function () { clearTimeout(cr); cr = setTimeout(drawCmp, 150); });
  }

  /* ---------------- calendar ---------------- */
  if ($("calendar-page")) {
    var calFilter = "all", mineOnly = false, mine = {}, calLimit = 60;
    var drawCal = function () {
      Promise.all([getJSON("data/calendar.json"), S(), Q()]).then(function (r) {
        var ev = ((r[0] && r[0].events) || []).map(function (e) { return { date: e.date, type: e.type, title: e.title, detail: e.detail, kind: e.type === "Holiday" ? "holiday" : "eco" }; });
        var st = r[1], q = r[2];
        Object.keys(st).forEach(function (t) {
          var s = st[t], nm = (q[t] && q[t].name) || s.name || "";
          if (s.earnings) ev.push({ date: s.earnings, type: "Earnings", title: t + " earnings", detail: nm, kind: "earn", t: t });
          if (s.exDiv) ev.push({ date: s.exDiv, type: "Dividend", title: t + " ex-dividend date", detail: (s.divRate ? money(s.divRate / 4) + " per share (estimated quarterly)" : nm), kind: "div", t: t });
        });
        ev = ev.filter(function (e) { return e.date >= today && (calFilter === "all" || e.kind === calFilter) && (!mineOnly || !e.t || mine[e.t]); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1; });
        var html = "", month = "", more = ev.length - calLimit;
        ev.slice(0, calLimit).forEach(function (e) {
          var d = new Date(e.date + "T12:00:00"), m = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
          if (m !== month) { html += '<h3 class="cal-month">' + m + "</h3>"; month = m; }
          var days = Math.round((d - new Date(today + "T12:00:00")) / 864e5);
          html += '<div class="ev"><div class="dt">' + d.toLocaleDateString("en-US", { month: "short" }) + "<b>" + d.getDate() + '</b></div><div><div class="type">' + esc(e.type) + '</div><div class="t">' + (e.t ? '<a href="stock.html?s=' + encodeURIComponent(e.t) + '">' + esc(e.title) + "</a>" : esc(e.title)) + '</div><div class="m">' + esc(e.detail || "") + '</div></div><div class="meta">' + (days === 0 ? "Today" : days === 1 ? "Tomorrow" : "In " + days + " days") + "</div></div>";
        });
        if (more > 0) html += '<button type="button" class="btn small" id="cal-more" style="margin-top:16px">Show ' + Math.min(more, 60) + ' more</button>';
        $("cal").innerHTML = html || '<div class="empty"><strong>Nothing here yet</strong>' + (Object.keys(st).length ? "Try another filter." : "Earnings and dividend dates appear after the site's daily data job runs.") + "</div>";
      });
    };
    $("cal").addEventListener("click", function (e) { if (e.target.id === "cal-more") { calLimit += 60; drawCal(); } });
    $("cal-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-f]"); if (!b) return; calFilter = b.dataset.f; calLimit = 60; document.querySelectorAll("#cal-tabs button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); drawCal(); });
    $("cal-mine").addEventListener("change", function () { mineOnly = $("cal-mine").checked; calLimit = 60; drawCal(); });
    userReady().then(function (ok) {
      if (!ok) { $("cal-mine").disabled = true; return; }
      return Promise.all([Store.getHoldings(), Store.getWatchlist()]).then(function (r) { r[0].concat(r[1]).forEach(function (h) { mine[h.ticker] = 1; }); if (Object.keys(mine).length) $("cal-mine").checked = mineOnly = true; });
    }).finally(drawCal);
  }

  /* ---------------- dividends (Portfolio tab) ---------------- */
  if ($("dividends")) {
    userReady().then(function (ok) {
      if (!ok) return;
      return Promise.all([Store.getHoldings(), S(), Q()]).then(function (r) {
        var hs = r[0], st = r[1], q = r[2];
        var rows = hs.map(function (h) { var s = st[h.ticker] || {}, sh = Number(h.shares) || 0, rate = s.divRate || 0; return { t: h.ticker, sh: sh, rate: rate, income: rate * sh, yld: s.divYield, ex: s.exDiv, pay: s.payDate, value: q[h.ticker] ? q[h.ticker].price * sh : null }; });
        var payers = rows.filter(function (x) { return x.rate; }).sort(function (a, b) { return b.income - a.income; });
        var annual = payers.reduce(function (a, x) { return a + x.income; }, 0), val = rows.reduce(function (a, x) { return a + (x.value || 0); }, 0);
        if (!hs.length) { $("dividends").innerHTML = '<div class="empty"><strong>No holdings yet</strong>Add stocks above to see the dividends they pay you.</div>'; return; }
        if (!Object.keys(st).length) { $("dividends").innerHTML = '<div class="empty"><strong>Dividend data loads once a day</strong>Your expected income appears after the site\'s daily data job runs.</div>'; return; }
        var next = payers.filter(function (x) { return (x.pay && x.pay >= today) || (x.ex && x.ex >= today); }).sort(function (a, b) { return (a.pay || a.ex) < (b.pay || b.ex) ? -1 : 1; });
        $("dividends").innerHTML = '<div class="divsum"><div><div class="k">Expected yearly income</div><div class="v">' + money(annual) + '</div></div><div><div class="k">Per month (average)</div><div class="v">' + money(annual / 12) + '</div></div><div><div class="k">Portfolio yield</div><div class="v">' + (val ? ((annual / val) * 100).toFixed(2) + "%" : "—") + '</div></div><div><div class="k">Next payout</div><div class="v">' + (next[0] ? esc(next[0].t) + " · " + fmtDay(next[0].pay || next[0].ex) : "—") + "</div></div></div>" +
          (payers.length ? '<div class="tablewrap"><table><thead><tr><th>Symbol</th><th class="r">Shares</th><th class="r">Dividend / share</th><th class="r">Yearly income</th><th class="r">Yield</th><th class="r">Ex-dividend</th><th class="r">Pay date</th></tr></thead><tbody>' + payers.map(function (x) {
            return '<tr><td><a href="stock.html?s=' + encodeURIComponent(x.t) + '"><b>' + esc(x.t) + '</b></a></td><td class="r">' + x.sh.toLocaleString("en-US", { maximumFractionDigits: 4 }) + '</td><td class="r">' + money(x.rate) + '</td><td class="r gain">' + money(x.income) + '</td><td class="r">' + (x.yld ? (x.yld * 100).toFixed(2) + "%" : "—") + '</td><td class="r">' + fmtDay(x.ex) + '</td><td class="r">' + fmtDay(x.pay) + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="note">None of your holdings pay a dividend right now.</p>') +
          '<p class="note">Income uses each company\'s current yearly dividend rate. Actual payouts can change.</p>';
      });
    });
  }
})();
