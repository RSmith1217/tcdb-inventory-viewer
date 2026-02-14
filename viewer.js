(() => {
  const state = {
    rows: [],
    filtered: [],
    page: 1,
    pageSize: 50,
  };

  const els = {
    q: document.getElementById("q"),
    minPrice: document.getElementById("minPrice"),
    maxPrice: document.getElementById("maxPrice"),
    minQty: document.getElementById("minQty"),
    sortBy: document.getElementById("sortBy"),
    sportFilter: document.getElementById("sportFilter"),
    pageSize: document.getElementById("pageSize"),
    reloadBtn: document.getElementById("reloadBtn"),
    shownCount: document.getElementById("shownCount"),
    totalCount: document.getElementById("totalCount"),
    unitsCount: document.getElementById("unitsCount"),
    status: document.getElementById("status"),
    error: document.getElementById("error"),
    rows: document.getElementById("rows"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    pageInfo: document.getElementById("pageInfo"),
  };

  const FALLBACK_JSONS = [
    "./data/tcdb_inventory_baseball.json",
    "./data/tcdb_inventory_basketball.json",
    "./data/tcdb_inventory_football.json",
    "./data/tcdb_inventory_gaming.json",
    "./data/tcdb_inventory_golf.json",
    "./data/tcdb_inventory_hockey.json",
    "./data/tcdb_inventory_mma.json",
    "./data/tcdb_inventory_multi-sport.json",
    "./data/tcdb_inventory_non-sport.json",
    "./data/tcdb_inventory_racing.json",
    "./data/tcdb_inventory_socce.json",
    "./data/manual_cards.json",
  ];

  async function discoverDefaultJsons() {
    try {
      // Works with python -m http.server directory listing.
      const res = await fetch("./data/", { cache: "no-store" });
      if (!res.ok) return FALLBACK_JSONS;
      const html = await res.text();
      const hrefs = [...html.matchAll(/href="([^"]+\.json)"/gi)].map((m) => m[1]);
      const names = [...new Set(hrefs)]
        .map((h) => h.split("?")[0].split("#")[0])
        .filter((h) => !h.includes(".."));

      if (!names.length) return FALLBACK_JSONS;

      // Prefer inventory/manual files first, then any other JSON files in ./data.
      const preferred = names.filter((n) => n.startsWith("tcdb_inventory") || n === "manual_cards.json");
      const other = names.filter((n) => !preferred.includes(n));
      return [...preferred, ...other].map((n) => `./data/${n}`);
    } catch (_) {
      return FALLBACK_JSONS;
    }
  }

  function asNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function money(v) {
    if (v == null || Number.isNaN(Number(v))) return "-";
    return `$${Number(v).toFixed(2)}`;
  }

  function rowText(r) {
    return `${r.set_name || ""} ${r.card_number || ""} ${r.card_name || ""} ${r.player || ""} ${r.team || ""}`.toLowerCase();
  }

  function setError(msg) {
    els.error.hidden = !msg;
    els.error.textContent = msg || "";
  }

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function applyFilters() {
    const q = els.q.value.trim().toLowerCase();
    const minP = els.minPrice.value === "" ? null : asNum(els.minPrice.value, null);
    const maxP = els.maxPrice.value === "" ? null : asNum(els.maxPrice.value, null);
    const minQ = els.minQty.value === "" ? null : asNum(els.minQty.value, null);
    const sport = els.sportFilter.value.trim().toLowerCase();

    let rows = state.rows.filter((r) => {
      const price = r.tcdb_price == null ? null : asNum(r.tcdb_price, null);
      const qty = asNum(r.quantity, 1);

      if (q && !rowText(r).includes(q)) return false;
      if (sport && String(r.sport || "").toLowerCase() !== sport) return false;
      if (minP != null && (price == null || price < minP)) return false;
      if (maxP != null && (price == null || price > maxP)) return false;
      if (minQ != null && qty < minQ) return false;
      return true;
    });

    rows.sort(sorter(els.sortBy.value));
    state.filtered = rows;
    state.page = 1;
    render();
  }

  function sorter(mode) {
    switch (mode) {
      case "name_desc":
        return (a, b) => String(b.card_name || "").localeCompare(String(a.card_name || ""));
      case "set_asc":
        return (a, b) => String(a.set_name || "").localeCompare(String(b.set_name || ""));
      case "sport_asc":
        return (a, b) => String(a.sport || "").localeCompare(String(b.sport || ""));
      case "qty_desc":
        return (a, b) => asNum(b.quantity, 1) - asNum(a.quantity, 1);
      case "qty_asc":
        return (a, b) => asNum(a.quantity, 1) - asNum(b.quantity, 1);
      case "price_desc":
        return (a, b) => asNum(b.tcdb_price, -1) - asNum(a.tcdb_price, -1);
      case "price_asc":
        return (a, b) => asNum(a.tcdb_price, Infinity) - asNum(b.tcdb_price, Infinity);
      case "name_asc":
      default:
        return (a, b) => String(a.card_name || "").localeCompare(String(b.card_name || ""));
    }
  }

  function render() {
    state.pageSize = asNum(els.pageSize.value, 50);
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;

    const start = (state.page - 1) * state.pageSize;
    const pageRows = state.filtered.slice(start, start + state.pageSize);

    els.rows.innerHTML = pageRows
      .map((r, i) => {
        const idx = start + i + 1;
        const href = r.card_url || "";
        const name = r.card_name || r.player || "";
        return `<tr>
          <td>${idx}</td>
          <td>${escapeHtml(r.sport || "")}</td>
          <td>${escapeHtml(r.set_name || "")}</td>
          <td>${escapeHtml(r.card_number || "")}</td>
          <td class="name">${escapeHtml(name)}</td>
          <td>${asNum(r.quantity, 1)}</td>
          <td>${money(r.tcdb_price)}</td>
          <td>${href ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">Open</a>` : "-"}</td>
        </tr>`;
      })
      .join("");

    els.shownCount.textContent = String(total);
    els.totalCount.textContent = String(state.rows.length);
    els.unitsCount.textContent = String(state.filtered.reduce((s, r) => s + asNum(r.quantity, 1), 0));
    els.pageInfo.textContent = `Page ${state.page} / ${pages}`;

    els.prevBtn.disabled = state.page <= 1;
    els.nextBtn.disabled = state.page >= pages;

    if (!pageRows.length) {
      els.rows.innerHTML = '<tr><td colspan="8">No matching cards.</td></tr>';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function normalizePayload(payload) {
    if (!payload || !Array.isArray(payload.cards)) {
      throw new Error("JSON missing cards array");
    }
    return payload.cards.map((r) => ({
      card_url: r.card_url || "",
      sport: r.sport || payload?.source?.sport || "",
      set_name: r.set_name || "",
      card_number: r.card_number || "",
      card_name: r.card_name || "",
      player: r.player || "",
      team: r.team || "",
      quantity: asNum(r.quantity, 1),
      tcdb_price: r.tcdb_price == null ? null : asNum(r.tcdb_price, null),
      tcdb_price_source: r.tcdb_price_source || "",
    }));
  }

  function mergeRows(listOfRows) {
    const byKey = new Map();
    for (const rows of listOfRows) {
      for (const r of rows) {
        const key = `${r.sport || ""}|${r.card_url || ""}`;
        if (!byKey.has(key)) {
          byKey.set(key, r);
        }
      }
    }
    return [...byKey.values()];
  }

  function refreshSportFilterOptions() {
    const current = els.sportFilter.value;
    const sports = [...new Set(state.rows.map((r) => String(r.sport || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );

    els.sportFilter.innerHTML = '<option value="">All Sports</option>' +
      sports.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");

    if (sports.some((s) => s.toLowerCase() === current.toLowerCase())) {
      els.sportFilter.value = current;
    }
  }

  async function loadDefault() {
    setError("");
    setStatus("Loading default JSON files...");
    try {
      const defaultJsons = await discoverDefaultJsons();
      const loaded = [];
      const loadedNames = [];
      for (const path of defaultJsons) {
        try {
          const res = await fetch(path, { cache: "no-store" });
          if (!res.ok) continue;
          const payload = await res.json();
          loaded.push(normalizePayload(payload));
          loadedNames.push(path);
        } catch (_) {
          // continue
        }
      }
      if (!loaded.length) throw new Error("No default JSON files found");
      state.rows = mergeRows(loaded);
      refreshSportFilterOptions();
      setStatus(`Loaded ${state.rows.length} cards from ${loadedNames.length} file(s).`);
      applyFilters();
    } catch (err) {
      state.rows = [];
      state.filtered = [];
      render();
      setStatus("Could not auto-load default JSON.");
      setError(
        "If you opened this file directly (file://), run a local server: `cd Inventory && python3 -m http.server 8000` then open http://localhost:8000/view.html"
      );
    }
  }

  [els.q, els.minPrice, els.maxPrice, els.minQty, els.sortBy, els.pageSize, els.sportFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  });

  els.prevBtn.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    render();
  });

  els.nextBtn.addEventListener("click", () => {
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    state.page = Math.min(pages, state.page + 1);
    render();
  });

  els.reloadBtn.addEventListener("click", loadDefault);

  loadDefault();
})();
