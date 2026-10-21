// Tankers page: live oil and gas tanker positions on a pannable, zoomable world map.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var page = $("tanker-page");
  if (!page) return;

  var REGIONS = [
    { k: "world", name: "World", box: [-180, -58, 180, 78] },
    { k: "gulf", name: "Persian Gulf and Hormuz", box: [47, 22, 60, 31] },
    { k: "red", name: "Red Sea and Suez", box: [31, 11, 45, 32] },
    { k: "malacca", name: "Malacca and Singapore", box: [94, -2, 106, 8] },
    { k: "china", name: "China and Korea coast", box: [110, 18, 132, 41] },
    { k: "northsea", name: "North Sea and Baltic", box: [-6, 50, 30, 61] },
    { k: "med", name: "Mediterranean", box: [-6, 30, 37, 46] },
    { k: "black", name: "Black Sea", box: [27, 40, 42, 47.5] },
    { k: "usgulf", name: "US Gulf Coast", box: [-98, 18, -80, 31] },
    { k: "panama", name: "Panama Canal", box: [-82, 7, -77, 10.5] }
  ];
  // AIS navigational status: 1 at anchor, 5 moored.
  var stopped = function (s) { return s.st === 1 || s.st === 5 || (s.sog != null && s.sog < 0.5); };
  var ago = function (ts) { var m = Math.round((Date.now() / 1000 - ts) / 60); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " hr ago"; };
  var STATUS = { 0: "Under way", 1: "At anchor", 2: "Not under command", 3: "Restricted", 5: "Moored", 6: "Aground", 8: "Sailing" };

  var cv = $("tk-map"), ctx = cv.getContext("2d"), wrap = cv.parentNode;
  var land = null, landHi = null, ships = [], shown = [], filter = "all", query = "", picked = null;
  var view = { cx: 10, cy: 15, z: 1 }; // center lon/lat, zoom (1 = whole world)
  var W = 0, H = 0, dpr = 1, raf = 0;

  // Equirectangular projection: at zoom 1, 360° of longitude spans the canvas width.
  var scale = function () { return (W / 360) * view.z; };
  var px = function (lon, lat) { var k = scale(); return [W / 2 + (lon - view.cx) * k, H / 2 - (lat - view.cy) * k]; };
  var unpx = function (x, y) { var k = scale(); return [view.cx + (x - W / 2) / k, view.cy - (y - H / 2) / k]; };
  var clampView = function () {
    view.z = Math.max(1, Math.min(60, view.z));
    var halfW = 180 / view.z, halfH = (H / 2) / scale();
    view.cx = Math.max(-180 + halfW, Math.min(180 - halfW, view.cx));
    var lo = -62 + halfH, hi = 82 - halfH;
    view.cy = lo > hi ? 10 : Math.max(lo, Math.min(hi, view.cy));
  };
  var tok = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };

  function size() {
    dpr = window.devicePixelRatio || 1;
    W = wrap.clientWidth; H = Math.round(Math.min(Math.max(W * 0.52, 320), 640));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
    clampView(); draw();
  }
  function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok("--sea") || "#eef2fb"; ctx.fillRect(0, 0, W, H);
    var rings = (view.z >= 3 && landHi) || land;
    if (view.z >= 3 && !landHi) loadHi();
    if (rings) {
      ctx.fillStyle = tok("--land") || "#d9dfeb"; ctx.strokeStyle = tok("--land-edge") || "#c5cddd"; ctx.lineWidth = 0.6;
      ctx.beginPath();
      var tl = unpx(0, 0), br = unpx(W, H);
      for (var r = 0; r < rings.length; r++) {
        var a = rings[r], minx = 999, maxx = -999, miny = 999, maxy = -999, i;
        for (i = 0; i < a.length; i += 2) { if (a[i] < minx) minx = a[i]; if (a[i] > maxx) maxx = a[i]; if (a[i + 1] < miny) miny = a[i + 1]; if (a[i + 1] > maxy) maxy = a[i + 1]; }
        if (maxy < br[1] || miny > tl[1]) continue;
        // Rings that cross the date line are stored unwrapped, so draw them again shifted a full turn.
        for (var off = -360; off <= 360; off += 360) {
          if (maxx + off < tl[0] || minx + off > br[0]) continue;
          for (i = 0; i < a.length; i += 2) { var p = px(a[i] + off, a[i + 1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
          ctx.closePath();
        }
      }
      ctx.fill(); ctx.stroke();
    }
    var go = tok("--accent") || "#3e5bf2", stop = "#f79009", rad = view.z < 3 ? 1.8 : view.z < 10 ? 2.6 : 3.6;
    for (var s = 0; s < shown.length; s++) {
      var sh = shown[s], q = px(sh.lon, sh.lat);
      if (q[0] < -5 || q[0] > W + 5 || q[1] < -5 || q[1] > H + 5) continue;
      var still = stopped(sh);
      ctx.fillStyle = still ? stop : go;
      if (!still && sh.cog != null && view.z >= 4) {
        var ang = (sh.cog - 90) * Math.PI / 180, L = rad * 2.6;
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.6, rad * 1.2); ctx.lineTo(-L * 0.6, -rad * 1.2); ctx.closePath(); ctx.fill(); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 6.283); ctx.fill(); }
    }
    if (picked) {
      var pp = px(picked.lon, picked.lat);
      ctx.strokeStyle = tok("--ink") || "#101828"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pp[0], pp[1], rad + 6, 0, 6.283); ctx.stroke();
    }
  }

  function applyFilter() {
    var qq = query.toUpperCase();
    shown = ships.filter(function (s) {
      if (filter === "moving" && stopped(s)) return false;
      if (filter === "stopped" && !stopped(s)) return false;
      return !qq || (s.n || "").toUpperCase().indexOf(qq) >= 0 || (s.d || "").toUpperCase().indexOf(qq) >= 0 || s.m === qq;
    });
    $("tk-count").textContent = shown.length.toLocaleString() + " shown";
    draw();
  }

  function info(s) {
    picked = s; draw();
    if (!s) { $("tk-info").innerHTML = '<p class="note" style="margin:0">Tap or click a ship on the map to see its details.</p>'; return; }
    var row = function (k, v) { return v == null || v === "" ? "" : '<div class="kv"><span>' + k + "</span><b>" + esc(v) + "</b></div>"; };
    $("tk-info").innerHTML = '<div class="type">' + (stopped(s) ? "Stopped" : "Under way") + '</div><div class="tk-name">' + esc(s.n) + "</div>" +
      row("Status", STATUS[s.st] || (stopped(s) ? "Stopped" : "Under way")) +
      row("Speed", s.sog != null ? s.sog.toFixed(1) + " knots" : null) + row("Heading", s.cog != null ? Math.round(s.cog) + "°" : null) +
      row("Destination", s.d) + row("Length", s.len ? s.len + " m" : null) + row("Draught", s.dr ? s.dr + " m" : null) +
      row("Position", s.lat.toFixed(2) + ", " + s.lon.toFixed(2)) + row("Last seen", ago(s.ts)) + row("MMSI", s.m) +
      '<a class="btn small" style="margin-top:12px" target="_blank" rel="noopener" href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:' + encodeURIComponent(s.m) + '">More on MarineTraffic ↗</a>';
  }

  function zoomTo(box) {
    var k = Math.min(360 / (box[2] - box[0]), (360 * H / W) / (box[3] - box[1]));
    view.z = Math.max(1, k * 0.95); view.cx = (box[0] + box[2]) / 2; view.cy = (box[1] + box[3]) / 2; clampView(); draw();
  }
  function zoomAt(x, y, f) {
    var g = unpx(x, y); view.z *= f; clampView();
    var g2 = unpx(x, y); view.cx += g[0] - g2[0]; view.cy += g[1] - g2[1]; clampView(); draw();
  }
  function nearest(x, y) {
    var best = null, bd = 14 * 14;
    shown.forEach(function (s) { var q = px(s.lon, s.lat), d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (d < bd) { bd = d; best = s; } });
    return best;
  }

  // Pointer handling: drag to pan, pinch or wheel to zoom, tap to pick a ship.
  var pts = {}, drag = null, pinch = null, moved = false;
  var pos = function (e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId); pts[e.pointerId] = pos(e); moved = false;
    var ids = Object.keys(pts);
    if (ids.length === 1) drag = { p: pts[ids[0]], cx: view.cx, cy: view.cy };
    else if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view.z }; drag = null; }
  });
  cv.addEventListener("pointermove", function (e) {
    if (!pts[e.pointerId]) { cv.style.cursor = nearest.apply(null, pos(e)) ? "pointer" : "grab"; return; }
    pts[e.pointerId] = pos(e); var ids = Object.keys(pts);
    if (pinch && ids.length === 2) {
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.z * d / pinch.d) / view.z); moved = true;
    } else if (drag) {
      var p = pts[e.pointerId], k = scale();
      if (Math.abs(p[0] - drag.p[0]) + Math.abs(p[1] - drag.p[1]) > 4) moved = true;
      view.cx = drag.cx - (p[0] - drag.p[0]) / k; view.cy = drag.cy + (p[1] - drag.p[1]) / k; clampView(); draw();
    }
  });
  var up = function (e) {
    if (!pts[e.pointerId]) return;
    var p = pts[e.pointerId]; delete pts[e.pointerId];
    if (!moved && !pinch) info(nearest(p[0], p[1]));
    if (!Object.keys(pts).length) { drag = null; pinch = null; }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener("dblclick", function (e) { var p = pos(e); zoomAt(p[0], p[1], 2); });
  $("tk-in").addEventListener("click", function () { zoomAt(W / 2, H / 2, 1.6); });
  $("tk-out").addEventListener("click", function () { zoomAt(W / 2, H / 2, 1 / 1.6); });

  $("tk-regions").innerHTML = REGIONS.map(function (r, i) { return '<button type="button" data-r="' + r.k + '" aria-pressed="' + (i === 0) + '">' + r.name.replace(" and ", " & ") + "</button>"; }).join("");
  var pressRegion = function (k) { document.querySelectorAll("#tk-regions button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.r === k)); }); };
  $("tk-regions").addEventListener("click", function (e) { var b = e.target.closest("button[data-r]"); if (!b) return; pressRegion(b.dataset.r); zoomTo(REGIONS.filter(function (r) { return r.k === b.dataset.r; })[0].box); });
  $("tk-filter").addEventListener("click", function (e) { var b = e.target.closest("button[data-f]"); if (!b) return; filter = b.dataset.f; document.querySelectorAll("#tk-filter button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); applyFilter(); });
  $("tk-search").addEventListener("input", function () { query = this.value.trim(); applyFilter(); });
  $("tk-search-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (shown.length && query) { var s = shown[0]; info(s); view.z = Math.max(view.z, 12); view.cx = s.lon; view.cy = s.lat; clampView(); draw(); }
  });
  $("tk-table").addEventListener("click", function (e) { var r = e.target.closest("[data-r]"); if (!r) return; pressRegion(r.dataset.r); zoomTo(REGIONS.filter(function (x) { return x.k === r.dataset.r; })[0].box); window.scrollTo({ top: page.offsetTop, behavior: "smooth" }); });

  function loadHi() {
    if (loadHi.busy) return; loadHi.busy = true;
    fetch("data/map/land-50m.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) { landHi = d; draw(); } }).catch(function () {});
  }

  function summary(data) {
    var moving = ships.filter(function (s) { return !stopped(s); }).length;
    $("tk-total").textContent = ships.length.toLocaleString();
    $("tk-moving").textContent = moving.toLocaleString();
    $("tk-stopped").textContent = (ships.length - moving).toLocaleString();
    $("tk-updated").textContent = data && data.updatedAt ? ago(Date.parse(data.updatedAt) / 1000) : "—";
    var rows = REGIONS.slice(1).map(function (r) {
      var b = r.box, inR = ships.filter(function (s) { return s.lon >= b[0] && s.lon <= b[2] && s.lat >= b[1] && s.lat <= b[3]; });
      var st = inR.filter(stopped).length;
      return { r: r, n: inR.length, st: st };
    }).sort(function (a, b) { return b.n - a.n; });
    $("tk-table").innerHTML = '<table><thead><tr><th>Area</th><th class="num">Tankers</th><th class="num">Moving</th><th class="num">Stopped</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr data-r="' + x.r.k + '" style="cursor:pointer"><td><a href="#tanker-page" onclick="return false">' + esc(x.r.name) + '</a></td><td class="num">' + x.n.toLocaleString() + '</td><td class="num">' + (x.n - x.st).toLocaleString() + '</td><td class="num">' + x.st.toLocaleString() + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  window.addEventListener("resize", size);
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  size(); info(null);
  Promise.all([
    fetch("data/map/land-110m.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("data/tankers.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (r) {
    land = r[0]; ships = (r[1] && r[1].ships) || [];
    summary(r[1]); applyFilter();
    var want = new URLSearchParams(location.search).get("r");
    if (want && REGIONS.some(function (x) { return x.k === want; })) { pressRegion(want); zoomTo(REGIONS.filter(function (x) { return x.k === want; })[0].box); }
    if (!ships.length) $("tk-empty").hidden = false;
  });
})();
