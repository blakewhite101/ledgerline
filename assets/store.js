// Where a visitor's portfolio and notes live.
// With Supabase configured (assets/config.js): the signed-in user's account, on any device.
// Without it: this browser's localStorage, so the site still works before accounts are set up.
(function () {
  "use strict";
  var cfg = window.LEDGERLINE_CONFIG || {};
  var cloud = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var sb = cloud ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  var user = null;

  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function check(res) { if (res.error) throw new Error(res.error.message); return res.data; }

  // On a user's first sign-in, copy anything they saved in this browser before accounts existed.
  async function importLocal() {
    var hs = load("ll-holdings"), ns = load("ll-notes"), ws = load("ll-watch"), as = load("ll-alerts");
    if (!hs.length && !ns.length && !ws.length && !as.length) return;
    if (ws.length) check(await sb.from("watchlist").upsert(ws.map(function (w) { return { ticker: w.ticker }; })));
    if (as.length) check(await sb.from("alerts").insert(as.map(function (a) { return { ticker: a.ticker, kind: a.kind, value: a.value, triggered_at: a.triggeredAt }; })));
    if (hs.length) check(await sb.from("holdings").upsert(hs.map(function (h) { return { ticker: h.ticker, shares: h.shares, cost: h.cost || 0, sector: h.sector || "" }; })));
    if (ns.length) check(await sb.from("notes").insert(ns.map(function (n) { return { text: n.text, created_at: n.createdAt }; })));
    try { ["ll-holdings", "ll-notes", "ll-watch", "ll-alerts"].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }

  var ready = (async function () {
    if (!cloud) return { mode: "local", user: null };
    var s = check(await sb.auth.getSession());
    user = s.session ? s.session.user : null;
    if (user) { try { await importLocal(); } catch (e) { console.warn("import failed", e); } }
    return { mode: "cloud", user: user };
  })();

  var Store = {
    cloud: cloud,
    ready: function () { return ready; },
    client: sb,

    getHoldings: async function () {
      if (!cloud) return load("ll-holdings");
      if (!user) return [];
      return check(await sb.from("holdings").select("ticker,shares,cost,sector").order("ticker"))
        .map(function (h) { return { ticker: h.ticker, shares: Number(h.shares), cost: Number(h.cost), sector: h.sector }; });
    },
    saveHolding: async function (h) {
      if (!cloud) { var all = load("ll-holdings").filter(function (x) { return x.ticker !== h.ticker; }).concat([h]); if (!save("ll-holdings", all)) throw new Error("This browser is blocking saved data."); return; }
      check(await sb.from("holdings").upsert({ ticker: h.ticker, shares: h.shares, cost: h.cost || 0, sector: h.sector || "", updated_at: new Date().toISOString() }));
    },
    deleteHolding: async function (ticker) {
      if (!cloud) { save("ll-holdings", load("ll-holdings").filter(function (x) { return x.ticker !== ticker; })); return; }
      check(await sb.from("holdings").delete().eq("ticker", ticker));
    },

    getNotes: async function () {
      if (!cloud) return load("ll-notes");
      if (!user) return [];
      return check(await sb.from("notes").select("id,text,created_at").order("created_at", { ascending: false }))
        .map(function (n) { return { id: n.id, text: n.text, createdAt: n.created_at }; });
    },
    addNote: async function (text) {
      if (!cloud) { var ns = load("ll-notes"); ns.push({ id: Date.now().toString(36), text: text, createdAt: new Date().toISOString() }); if (!save("ll-notes", ns)) throw new Error("This browser is blocking saved data."); return; }
      check(await sb.from("notes").insert({ text: text }));
    },
    deleteNote: async function (id) {
      if (!cloud) { save("ll-notes", load("ll-notes").filter(function (n) { return n.id !== id; })); return; }
      check(await sb.from("notes").delete().eq("id", id));
    },

    getWatchlist: async function () {
      if (!cloud) return load("ll-watch");
      if (!user) return [];
      return check(await sb.from("watchlist").select("ticker,added_at").order("added_at")).map(function (w) { return { ticker: w.ticker }; });
    },
    addWatch: async function (ticker) {
      if (!cloud) { var w = load("ll-watch").filter(function (x) { return x.ticker !== ticker; }); w.push({ ticker: ticker }); if (!save("ll-watch", w)) throw new Error("This browser is blocking saved data."); return; }
      check(await sb.from("watchlist").upsert({ ticker: ticker }));
    },
    removeWatch: async function (ticker) {
      if (!cloud) { save("ll-watch", load("ll-watch").filter(function (x) { return x.ticker !== ticker; })); return; }
      check(await sb.from("watchlist").delete().eq("ticker", ticker));
    },

    // Alerts: {id, ticker, kind: "above" | "below" | "move", value, triggeredAt}
    getAlerts: async function () {
      if (!cloud) return load("ll-alerts");
      if (!user) return [];
      return check(await sb.from("alerts").select("id,ticker,kind,value,triggered_at").order("created_at"))
        .map(function (a) { return { id: a.id, ticker: a.ticker, kind: a.kind, value: Number(a.value), triggeredAt: a.triggered_at }; });
    },
    addAlert: async function (a) {
      if (!cloud) { var all = load("ll-alerts"); all.push({ id: Date.now().toString(36), ticker: a.ticker, kind: a.kind, value: a.value, triggeredAt: null }); if (!save("ll-alerts", all)) throw new Error("This browser is blocking saved data."); return; }
      check(await sb.from("alerts").insert({ ticker: a.ticker, kind: a.kind, value: a.value }));
    },
    markAlert: async function (id) {
      var now = new Date().toISOString();
      if (!cloud) { save("ll-alerts", load("ll-alerts").map(function (a) { return a.id === id ? Object.assign({}, a, { triggeredAt: now }) : a; })); return; }
      check(await sb.from("alerts").update({ triggered_at: now }).eq("id", id));
    },
    deleteAlert: async function (id) {
      if (!cloud) { save("ll-alerts", load("ll-alerts").filter(function (a) { return a.id !== id; })); return; }
      check(await sb.from("alerts").delete().eq("id", id));
    },

    signOut: async function () { if (sb) await sb.auth.signOut(); location.href = "./"; }
  };
  window.LedgerlineStore = Store;

  // Header: "Sign in" button, or the signed-in email with a sign-out link.
  ready.then(function (st) {
    var slot = document.getElementById("auth-slot");
    if (!slot || st.mode !== "cloud") return;
    if (st.user) {
      slot.innerHTML = '<span class="who"></span><button class="btn ghost" type="button" id="signout">Sign out</button>';
      slot.querySelector(".who").textContent = st.user.email;
      document.getElementById("signout").addEventListener("click", Store.signOut);
    } else {
      var next = encodeURIComponent(location.pathname.split("/").pop() || "");
      slot.innerHTML = '<a class="btn" href="login.html?next=' + next + '">Sign in</a><a class="btn primary" href="login.html?mode=signup&amp;next=' + next + '">Sign up</a>';
    }
  });
})();
