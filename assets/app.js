// Portfolio, Notes and the Markets "for your portfolio" box. Saving goes through LedgerlineStore (account or this browser).
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n, sign) {
    var v = Number(n) || 0;
    var s = Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
    if (sign) return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
    return (v < 0 ? "−" : "") + s;
  };
  var pct = function (n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%"; };
  var cls = function (n) { return n > 0 ? "gain" : n < 0 ? "loss" : ""; };
  var fmtWhen = function (iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); };

  var Store = window.LedgerlineStore;
  var getJSON = function (url) { return fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  var tickerNews = getJSON("data/ticker-news.json");

  // In account mode, Portfolio and Notes need a signed-in user.
  function requireUser() {
    return Store.ready().then(function (st) {
      if (st.mode === "cloud" && !st.user) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop())); return false; }
      return true;
    });
  }

  // Newest headlines across the given tickers, tagged with their ticker.
  function storiesFor(tickers, perTicker, limit) {
    return tickerNews.then(function (d) {
      var all = [], seen = {};
      tickers.forEach(function (t) {
        ((d && d.news && d.news[t]) || []).slice(0, perTicker).forEach(function (n) {
          if (seen[n.url]) return; seen[n.url] = 1; all.push({ t: t, title: n.title, url: n.url, date: n.date });
        });
      });
      all.sort(function (a, b) { return (b.date || "") < (a.date || "") ? -1 : 1; });
      return { ok: !!d, items: all.slice(0, limit) };
    });
  }
  var storyLi = function (n) { var d = n.date ? new Date(n.date) : null; return '<li><div class="src"><span class="chip">' + esc(n.t) + "</span> " + (d && !isNaN(d) ? esc(d.toLocaleDateString("en-US", { month: "short", day: "numeric" })) : "") + '</div><a href="' + esc(n.url) + '" rel="noopener" target="_blank">' + esc(n.title) + "</a></li>"; };

  /* ---------------- Portfolio ---------------- */
  if ($("holdwrap")) {
    var COLORS = { "Technology": "#3e5bf2", "Communication Services": "#7a5af8", "Consumer Discretionary": "#ee46bc", "Consumer Staples": "#16b364", "Health Care": "#06aed4", "Financials": "#f79009", "Industrials": "#667085", "Energy": "#ef6820", "Utilities": "#eaaa08", "Real Estate": "#9e77ed", "Materials": "#2e90fa", "ETF / Fund": "#98a2b3", "Other": "#d0d5dd" };
    var hue = function (t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return "hsl(" + h + " 55% 45%)"; };
    var quotes = {}, holdings = [], editing = null;
    // Sector comes from the price feed's ticker list; anything outside it is "Other".
    var sectorFor = function (h) { return (quotes[h.ticker] && quotes[h.ticker].sector) || "Other"; };
    var say = function (msg, err) { $("hold-status").textContent = msg; $("hold-status").className = err ? "status err" : "status"; };

    // Value of today's holdings on each of the past month's trading days.
    function valueSeries() {
      var byDay = {};
      holdings.forEach(function (h) {
        var hist = (quotes[h.ticker] && quotes[h.ticker].hist) || [];
        hist.forEach(function (p) { (byDay[p[0]] = byDay[p[0]] || {})[h.ticker] = p[1]; });
      });
      var days = Object.keys(byDay).sort(), last = {}, out = [];
      days.forEach(function (d) {
        holdings.forEach(function (h) { if (byDay[d][h.ticker] != null) last[h.ticker] = byDay[d][h.ticker]; });
        var complete = holdings.every(function (h) { return last[h.ticker] != null || !(quotes[h.ticker] && quotes[h.ticker].hist); });
        if (!complete) return;
        out.push([d, holdings.reduce(function (a, h) { return a + (last[h.ticker] || 0) * (Number(h.shares) || 0); }, 0)]);
      });
      return out;
    }

    function renderChart() {
      var pts = valueSeries();
      if (pts.length < 2) {
        $("chart").innerHTML = '<div class="empty"><strong>' + (holdings.length ? "Chart appears once prices load" : "Your portfolio chart") + "</strong>" + (holdings.length ? "The value chart uses daily prices from the site's price feed." : "Add a stock below to see your portfolio's value over the past month.") + "</div>";
        $("chart-range").textContent = ""; return;
      }
      var W = Math.max(300, Math.round($("chart").clientWidth || 800)), H = 220, L = 4, R = 64, T = 10, B = 24;
      var vs = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
      var pad = (hi - lo) * 0.12 || hi * 0.02 || 1; lo -= pad; hi += pad;
      var x = function (i) { return L + (i / (pts.length - 1)) * (W - L - R); };
      var y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
      var up = vs[vs.length - 1] >= vs[0], col = up ? "var(--gain)" : "var(--loss)";
      var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
      var area = line + " L" + x(pts.length - 1).toFixed(1) + " " + (H - B) + " L" + x(0).toFixed(1) + " " + (H - B) + " Z";
      var ticks = [0, 1, 2, 3].map(function (k) { var v = lo + (hi - lo) * (k + 0.5) / 4; return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="ax" x="' + (W - R + 8) + '" y="' + (y(v) + 4).toFixed(1) + '">' + money(v).replace(/\.\d\d$/, "") + "</text>"; }).join("");
      var lbl = function (d) { var t = new Date(d + "T12:00:00"); return t.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
      var mid = Math.floor((pts.length - 1) / 2);
      var xl = [0, mid, pts.length - 1].map(function (i, k) { return '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + lbl(pts[i][0]) + "</text>"; }).join("");
      var change = vs[vs.length - 1] - vs[0];
      $("chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Portfolio value over the past month"><defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (up ? "#12b76a" : "#f04438") + '" stop-opacity=".22"/><stop offset="1" stop-color="' + (up ? "#12b76a" : "#f04438") + '" stop-opacity="0"/></linearGradient></defs>' + ticks +
        '<path d="' + area + '" fill="url(#vg)"/><path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
        '<circle cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(vs[vs.length - 1]).toFixed(1) + '" r="4" fill="' + col + '"/>' + xl + "</svg>";
      $("chart-range").innerHTML = '1 month <span class="' + cls(change) + '">' + money(change, true) + " (" + pct((change / vs[0]) * 100) + ")</span>";
    }

    function renderSectors(rows, basis) {
      var by = {};
      rows.forEach(function (r) {
        var w = basis === "value" ? r.value : (r.c ? r.c * r.sh : r.sh);
        if (!w) return;
        if (!by[r.sector]) by[r.sector] = { name: r.sector, value: 0, tickers: [], color: COLORS[r.sector] || "#d0d5dd" };
        by[r.sector].value += w; by[r.sector].tickers.push(r.h.ticker);
      });
      var slices = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.value - a.value; });
      var total = slices.reduce(function (a, s) { return a + s.value; }, 0);
      if (!slices.length) { $("sectors").innerHTML = '<div class="empty"><strong>No sectors yet</strong>Each stock you add is sorted into its sector automatically, and this shows how your money is spread.</div>'; return; }
      var cx = 85, cy = 85, r = 80, ir = 52, a0 = -Math.PI / 2, paths = "";
      var pt = function (a, rad) { return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
      slices.forEach(function (s) {
        var frac = s.value / total;
        if (frac >= 0.9999) { paths += '<circle cx="85" cy="85" r="66" fill="none" stroke="' + s.color + '" stroke-width="28"/>'; return; }
        var a1 = a0 + frac * Math.PI * 2, big = frac > 0.5 ? 1 : 0;
        var p0 = pt(a0, r), p1 = pt(a1, r), p2 = pt(a1, ir), p3 = pt(a0, ir);
        paths += '<path d="M' + p0 + " A" + r + " " + r + " 0 " + big + " 1 " + p1 + " L" + p2 + " A" + ir + " " + ir + " 0 " + big + " 0 " + p3 + 'Z" fill="' + s.color + '" stroke="var(--card)" stroke-width="2"><title>' + esc(s.name) + " " + (frac * 100).toFixed(1) + "%</title></path>";
        a0 = a1;
      });
      $("sectors").innerHTML = '<div class="sectors"><svg viewBox="0 0 170 170" role="img" aria-label="Sector weights">' + paths +
        '<text x="85" y="80" text-anchor="middle" class="mid-k" style="font-size:11px;fill:var(--muted);font-weight:600">' + slices.length + " SECTOR" + (slices.length === 1 ? "" : "S") + '</text><text x="85" y="98" text-anchor="middle" style="font-size:15px;fill:var(--ink);font-weight:700">' + (basis === "value" ? money(total).replace(/\.\d\d$/, "") : "by cost") + "</text></svg>" +
        '<div class="legend">' + slices.map(function (s) { return '<div class="lg"><i style="background:' + s.color + '"></i><span>' + esc(s.name) + '</span><span class="p">' + ((s.value / total) * 100).toFixed(1) + '%</span><span class="sm">' + esc(s.tickers.join(", ")) + "</span></div>"; }).join("") + "</div></div>" +
        (basis !== "value" ? '<p class="note">Weighted by what you paid until every holding has a price.</p>' : "");
    }

    function render() {
      var val = 0, cost = 0, day = 0, priced = 0;
      var rows = holdings.map(function (h) {
        var q = quotes[h.ticker], sh = Number(h.shares) || 0, c = Number(h.cost) || 0;
        var price = q ? Number(q.price) : null, value = price != null ? price * sh : null;
        var gain = value != null && c ? value - c * sh : null;
        if (value != null) { val += value; priced++; if (c) cost += c * sh; day += (Number(q.change) || 0) * sh; }
        return { h: h, q: q, sh: sh, c: c, price: price, value: value, gain: gain, sector: sectorFor(h) };
      }).sort(function (a, b) { return (b.value != null ? b.value : b.c * b.sh) - (a.value != null ? a.value : a.c * a.sh); });

      var num = function (n) { return n.toLocaleString("en-US", { maximumFractionDigits: 4 }); };
      $("holdwrap").innerHTML = rows.length ? '<div class="tablewrap"><table><thead><tr><th>Symbol</th><th class="r">Shares</th><th class="r">Avg cost</th><th class="r">Price</th><th class="r">Today</th><th class="r">Value</th><th class="r">Gain</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          var t = esc(r.h.ticker), ed = editing === r.h.ticker;
          return '<tr><td><div class="tk"><span class="logo" style="background:' + hue(r.h.ticker) + '">' + esc(r.h.ticker.slice(0, 4)) + '</span><div><a href="https://finance.yahoo.com/quote/' + encodeURIComponent(r.h.ticker) + '" target="_blank" rel="noopener">' + t + '</a><div class="meta">' + esc((r.q && r.q.name) || r.sector) + "</div></div></div></td>" +
            '<td class="r">' + (ed ? '<input class="edit" id="e-shares" type="number" step="any" min="0" value="' + r.sh + '" aria-label="Shares">' : num(r.sh)) + "</td>" +
            '<td class="r">' + (ed ? '<input class="edit" id="e-cost" type="number" step="any" min="0" value="' + (r.c || "") + '" aria-label="Average cost">' : (r.c ? money(r.c) : "—")) + "</td>" +
            '<td class="r">' + (r.price != null ? money(r.price) : "—") + "</td>" +
            '<td class="r">' + (r.q ? '<span class="pill ' + cls(r.q.changePct) + '">' + pct(Number(r.q.changePct)) + "</span>" : "—") + "</td>" +
            '<td class="r">' + (r.value != null ? money(r.value) : "—") + "</td>" +
            '<td class="r ' + (r.gain != null ? cls(r.gain) : "") + '">' + (r.gain != null ? money(r.gain, true) : "—") + "</td>" +
            '<td class="r"><div class="acts">' + (ed
              ? '<button class="btn primary small" data-save="' + t + '">Save</button><button class="btn ghost small" data-cancel="1">Cancel</button>'
              : '<button class="btn ghost small" data-edit="' + t + '">Edit</button><button class="btn ghost danger small" data-del="' + t + '">Remove</button>') + "</div></td></tr>";
        }).join("") + "</tbody></table></div>"
        : '<div class="empty"><strong>No holdings yet</strong>Use "+ Add stock" to add a ticker and how many shares you own.</div>';

      $("p-val").textContent = money(val);
      var g = cost ? val - cost : 0;
      $("p-gain").textContent = cost ? money(g, true) + " (" + pct((g / cost) * 100) + ")" : "—"; $("p-gain").className = "move " + cls(g);
      $("p-day").textContent = money(day, true) + (val - day ? " (" + pct((day / (val - day)) * 100) + ")" : ""); $("p-day").className = "move " + cls(day);

      renderChart();
      renderSectors(rows, rows.length && priced === rows.length ? "value" : "cost");

      storiesFor(holdings.map(function (h) { return h.ticker; }), 4, 12).then(function (r) {
        $("mynews").innerHTML = r.items.length ? r.items.map(storyLi).join("")
          : '<li class="empty"><strong>No headlines about your stocks yet</strong>' + (holdings.length ? (r.ok ? "Tap a ticker in your holdings to see its full news page." : "Stock news appears once the site's news feed is running.") : "Add a stock to see news about it here.") + "</li>";
      });
    }

    function saveHolding(h, done) {
      return Store.saveHolding(h).then(function () {
        holdings = holdings.filter(function (x) { return x.ticker !== h.ticker; }).concat([h]);
        if (done) done();
        render();
      }, function (err) { say("Could not save " + h.ticker + ": " + err.message, true); });
    }

    var openAdd = function (open) { $("addhold").hidden = !open; $("add-toggle").setAttribute("aria-expanded", String(open)); if (open) $("h-ticker").focus(); };
    $("add-toggle").addEventListener("click", function () { openAdd($("addhold").hidden); });
    $("add-cancel").addEventListener("click", function () { $("addhold").reset(); openAdd(false); });
    $("addhold").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = $("h-ticker").value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
      var sh = parseFloat($("h-shares").value), c = parseFloat($("h-cost").value);
      if (!t || isNaN(sh)) { say("Enter a ticker and a share count.", true); return; }
      var prev = holdings.filter(function (h) { return h.ticker === t; })[0];
      saveHolding({ ticker: t, shares: sh, cost: isNaN(c) ? (prev ? prev.cost : 0) : c, sector: "" }, function () {
        say((prev ? "Updated " : "Added ") + t + "." + (quotes[t] || !Object.keys(quotes).length ? "" : " There's no live price for this ticker, so it's listed under Other."));
        $("addhold").reset(); openAdd(false);
      });
    });
    $("holdwrap").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.edit) { editing = b.dataset.edit; render(); var f = $("e-shares"); if (f) { f.focus(); f.select(); } return; }
      if (b.dataset.cancel) { editing = null; render(); return; }
      if (b.dataset.save) {
        var t = b.dataset.save, sh = parseFloat($("e-shares").value), c = parseFloat($("e-cost").value);
        if (isNaN(sh)) { say("Enter a share count.", true); return; }
        saveHolding({ ticker: t, shares: sh, cost: isNaN(c) ? 0 : c, sector: "" }, function () { editing = null; say("Updated " + t + "."); });
        return;
      }
      if (b.dataset.del) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Confirm"; setTimeout(function () { b.dataset.armed = ""; b.textContent = "Remove"; }, 3000); return; }
        var d = b.dataset.del;
        Store.deleteHolding(d).then(function () { holdings = holdings.filter(function (h) { return h.ticker !== d; }); say("Removed " + d + "."); render(); }, function (err) { say("Could not remove " + d + ": " + err.message, true); });
      }
    });
    $("holdwrap").addEventListener("keydown", function (e) {
      if (!editing) return;
      if (e.key === "Enter") { e.preventDefault(); var s = $("holdwrap").querySelector("button[data-save]"); if (s) s.click(); }
      if (e.key === "Escape") { editing = null; render(); }
    });

    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(renderChart, 150); });
    render();
    requireUser().then(function (ok) {
      if (!ok) return;
      return Promise.all([Store.getHoldings(), getJSON("data/quotes.json")]).then(function (res) {
        holdings = res[0] || [];
        if (res[1]) {
          quotes = res[1].quotes || {};
          $("tickers").innerHTML = Object.keys(quotes).map(function (t) { return '<option value="' + t + '">' + esc(quotes[t].name || "") + "</option>"; }).join("");
          $("updated").textContent = "Prices as of " + fmtWhen(res[1].updatedAt) + ". Live prices cover about 280 large US stocks and ETFs.";
        } else $("updated").textContent = "Live prices are not available right now.";
        render();
      });
    }).catch(function (err) { say("Could not load your portfolio: " + err.message, true); });
  }

  /* ---------------- Notes ---------------- */
  if ($("notes")) {
    var notes = [];
    var renderNotes = function () {
      var q = $("note-search").value.trim().toLowerCase();
      var ns = notes.filter(function (n) { return !q || n.text.toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      $("notes").innerHTML = ns.length ? ns.map(function (n) { return '<div class="notecard"><p>' + esc(n.text) + '</p><div class="meta"><span>' + esc(fmtWhen(n.createdAt)) + '</span><button class="btn ghost danger" data-note="' + esc(n.id) + '">Delete</button></div></div>'; }).join("")
        : '<div class="empty"><strong>' + (q ? "No notes match that search" : "No notes yet") + "</strong>" + (q ? "Try a different word." : "Write your first note above.") + "</div>";
    };
    var reload = function () { return Store.getNotes().then(function (ns) { notes = ns; renderNotes(); }); };
    var fail = function (err) { $("note-status").textContent = err.message; $("note-status").className = "status err"; };
    var add = function () {
      var text = $("note-text").value.trim(); if (!text) return;
      Store.addNote(text).then(function () { $("note-text").value = ""; $("note-status").textContent = "Saved."; $("note-status").className = "status"; return reload(); }, fail);
    };
    $("addnote").addEventListener("submit", function (e) { e.preventDefault(); add(); });
    $("note-text").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    $("note-search").addEventListener("input", renderNotes);
    $("notes").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-note]"); if (!b) return;
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Confirm delete"; setTimeout(function () { b.dataset.armed = ""; b.textContent = "Delete"; }, 3000); return; }
      Store.deleteNote(b.dataset.note).then(reload, fail);
    });
    renderNotes();
    requireUser().then(function (ok) { if (ok) return reload(); }).catch(fail);
  }

  /* ---------------- Markets: top stories for your portfolio ---------------- */
  if ($("my-stories")) {
    Store.ready().then(function (st) {
      if (st.mode === "cloud" && !st.user) {
        $("my-stories").innerHTML = '<li class="empty"><strong>See news about your stocks</strong><a href="login.html?mode=signup&amp;next=">Create a free account</a> or <a href="login.html">sign in</a>, then add your holdings on the Portfolio tab.</li>';
        return;
      }
      return Store.getHoldings().then(function (hs) {
        if (!hs.length) { $("my-stories").innerHTML = '<li class="empty"><strong>No stocks yet</strong>Add your holdings on the <a href="portfolio.html">Portfolio tab</a> to see stories about them here.</li>'; return; }
        return storiesFor(hs.map(function (h) { return h.ticker; }), 2, 8).then(function (r) {
          $("my-stories").innerHTML = r.items.length ? r.items.map(storyLi).join("") : '<li class="empty"><strong>No stories about your stocks yet</strong>' + (r.ok ? "Check back after the next news refresh." : "Stock news appears once the site's news feed is running.") + "</li>";
        });
      });
    }).catch(function () { $("my-stories").innerHTML = '<li class="empty">Your stories could not load right now.</li>'; });
  }
})();
