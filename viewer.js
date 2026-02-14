(() => {
  const state = {
    rows: [],
    filtered: [],
    page: 1,
    pageSize: 50,
    selectedQty: new Map(),
    quantityOverrides: new Map(),
  };

  const INVENTORY_OVERRIDES_KEY = "tcdb_inventory_qty_overrides_v1";
  const SELLER_CONFIRM_EMAIL = "rsmith17@gmail.com";

  const els = {
    q: document.getElementById("q"),
    minPrice: document.getElementById("minPrice"),
    maxPrice: document.getElementById("maxPrice"),
    minQty: document.getElementById("minQty"),
    sortBy: document.getElementById("sortBy"),
    sportFilter: document.getElementById("sportFilter"),
    pageSize: document.getElementById("pageSize"),
    inStockOnly: document.getElementById("inStockOnly"),
    selectedOnly: document.getElementById("selectedOnly"),

    shownCount: document.getElementById("shownCount"),
    totalCount: document.getElementById("totalCount"),
    unitsCount: document.getElementById("unitsCount"),
    selectedCount: document.getElementById("selectedCount"),
    selectedUnits: document.getElementById("selectedUnits"),
    selectedTotal: document.getElementById("selectedTotal"),

    status: document.getElementById("status"),
    error: document.getElementById("error"),
    rows: document.getElementById("rows"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    pageInfo: document.getElementById("pageInfo"),

    cartItems: document.getElementById("cartItems"),
    checkoutName: document.getElementById("checkoutName"),
    checkoutEmail: document.getElementById("checkoutEmail"),
    checkoutPayment: document.getElementById("checkoutPayment"),
    checkoutShipping: document.getElementById("checkoutShipping"),
    checkoutNotes: document.getElementById("checkoutNotes"),
    copyOrderBtn: document.getElementById("copyOrderBtn"),
    emailOrderBtn: document.getElementById("emailOrderBtn"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    finalizeSaleBtn: document.getElementById("finalizeSaleBtn"),
    clearCartBtn: document.getElementById("clearCartBtn"),
    orderPreview: document.getElementById("orderPreview"),
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
      const res = await fetch("./data/", { cache: "no-store" });
      if (!res.ok) return FALLBACK_JSONS;
      const html = await res.text();
      const hrefs = [...html.matchAll(/href="([^"]+\.json)"/gi)].map((m) => m[1]);
      const names = [...new Set(hrefs)]
        .map((h) => h.split("?")[0].split("#")[0])
        .filter((h) => !h.includes(".."));

      if (!names.length) return FALLBACK_JSONS;

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

  function myPrice(tcdbPrice) {
    const price = Number(tcdbPrice);
    if (!Number.isFinite(price)) return null;

    if (price <= 0.2) return 0.08;
    if (price < 1) return price * 0.7;
    if (price < 5) return price * 0.85;
    return price * 0.95;
  }

  function rowText(r) {
    return `${r.set_name || ""} ${r.card_number || ""} ${r.card_name || ""} ${r.player || ""} ${r.team || ""}`.toLowerCase();
  }

  function rowKey(r) {
    return `${r.sport || ""}|${r.card_url || ""}|${r.set_name || ""}|${r.card_number || ""}|${r.card_name || ""}`;
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

  function setError(msg) {
    els.error.hidden = !msg;
    els.error.textContent = msg || "";
  }

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadQuantityOverrides() {
    try {
      const raw = window.localStorage.getItem(INVENTORY_OVERRIDES_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return new Map();
      return new Map(
        Object.entries(parsed).map(([k, v]) => [k, Math.max(0, Math.floor(asNum(v, 0)))])
      );
    } catch (_) {
      return new Map();
    }
  }

  function saveQuantityOverrides() {
    try {
      const payload = Object.fromEntries(state.quantityOverrides.entries());
      window.localStorage.setItem(INVENTORY_OVERRIDES_KEY, JSON.stringify(payload));
    } catch (_) {
      // ignore storage failures
    }
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
        if (!byKey.has(key)) byKey.set(key, r);
      }
    }
    return [...byKey.values()];
  }

  function refreshSportFilterOptions() {
    const current = els.sportFilter.value;
    const sports = [...new Set(state.rows.map((r) => String(r.sport || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );

    els.sportFilter.innerHTML =
      '<option value="">All Sports</option>' + sports.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");

    if (sports.some((s) => s.toLowerCase() === current.toLowerCase())) {
      els.sportFilter.value = current;
    }
  }

  function selectedQtyForRow(r) {
    const key = rowKey(r);
    const maxQty = Math.max(0, asNum(r.quantity, 1));
    const selected = Math.max(0, asNum(state.selectedQty.get(key), 0));
    return Math.min(maxQty, selected);
  }

  function applyQuantityOverrides(rows) {
    for (const r of rows) {
      const key = rowKey(r);
      if (!state.quantityOverrides.has(key)) continue;
      r.quantity = Math.max(0, Math.floor(asNum(state.quantityOverrides.get(key), 0)));
    }
  }

  function getSelectedRows() {
    return state.rows
      .map((r) => ({ row: r, qty: selectedQtyForRow(r) }))
      .filter((x) => x.qty > 0);
  }

  function shippingDetails(method, units) {
    if (method === "Local pickup") {
      return { label: "Local pickup", estimate: 0, note: "No shipping charge." };
    }
    if (method === "PWE") {
      const envelopes = Math.max(1, Math.ceil(units / 15));
      const estimate = units > 0 ? envelopes * 2 : 0;
      return {
        label: "PWE",
        estimate,
        note: units > 15 ? `Estimated ${envelopes} envelopes x $2.` : "Estimated $2 for one envelope.",
      };
    }
    if (method === "BMWT") {
      if (units >= 80) {
        return {
          label: "Priority Mail",
          estimate: null,
          note: "80+ cards ship via Priority Mail flat-rate envelope/box. Final shipping cost requires approval.",
        };
      }
      return { label: "BMWT", estimate: units > 0 ? 8 : 0, note: "Estimated $8 (under 80 cards)." };
    }
    return { label: method, estimate: null, note: "Shipping cost to be confirmed." };
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
      case "my_price_desc":
        return (a, b) => asNum(myPrice(b.tcdb_price), -1) - asNum(myPrice(a.tcdb_price), -1);
      case "my_price_asc":
        return (a, b) => asNum(myPrice(a.tcdb_price), Infinity) - asNum(myPrice(b.tcdb_price), Infinity);
      case "name_asc":
      default:
        return (a, b) => String(a.card_name || "").localeCompare(String(b.card_name || ""));
    }
  }

  function applyFilters() {
    const q = els.q.value.trim().toLowerCase();
    const minP = els.minPrice.value === "" ? null : asNum(els.minPrice.value, null);
    const maxP = els.maxPrice.value === "" ? null : asNum(els.maxPrice.value, null);
    const minQ = els.minQty.value === "" ? null : asNum(els.minQty.value, null);
    const sport = els.sportFilter.value.trim().toLowerCase();
    const inStockOnly = !!els.inStockOnly.checked;
    const selectedOnly = !!els.selectedOnly.checked;

    let rows = state.rows.filter((r) => {
      const tcdb = r.tcdb_price == null ? null : asNum(r.tcdb_price, null);
      const listQty = asNum(r.quantity, 1);
      const mine = myPrice(tcdb);
      const selQty = selectedQtyForRow(r);

      if (q && !rowText(r).includes(q)) return false;
      if (sport && String(r.sport || "").toLowerCase() !== sport) return false;
      if (minP != null && (mine == null || mine < minP)) return false;
      if (maxP != null && (mine == null || mine > maxP)) return false;
      if (minQ != null && listQty < minQ) return false;
      if (inStockOnly && listQty < 1) return false;
      if (selectedOnly && selQty < 1) return false;
      return true;
    });

    rows.sort(sorter(els.sortBy.value));
    state.filtered = rows;
    state.page = 1;
    render();
  }

  function buildOrderSummary(selectedRows) {
    const buyer = els.checkoutName.value.trim() || "(not provided)";
    const email = els.checkoutEmail.value.trim() || "(not provided)";
    const payment = els.checkoutPayment.value;
    const notes = els.checkoutNotes.value.trim() || "(none)";
    const stamp = new Date().toLocaleString();

    const units = selectedRows.reduce((s, x) => s + x.qty, 0);
    const total = selectedRows.reduce((s, x) => s + asNum(myPrice(x.row.tcdb_price), 0) * x.qty, 0);
    const missingPriceRows = selectedRows.filter((x) => myPrice(x.row.tcdb_price) == null);
    const missingPriceUnits = missingPriceRows.reduce((s, x) => s + x.qty, 0);
    const shipping = shippingDetails(els.checkoutShipping.value, units);
    const knownWithShipping = shipping.estimate == null ? null : total + shipping.estimate;

    const lines = selectedRows.map((x, idx) => {
      const r = x.row;
      const name = r.card_name || r.player || "(unnamed card)";
      const setName = r.set_name || "(set unknown)";
      const cardNo = r.card_number || "-";
      const unit = asNum(myPrice(r.tcdb_price), 0);
      const line = unit * x.qty;
      return `${idx + 1}. ${name} | ${r.sport || ""} | ${setName} #${cardNo} | Qty ${x.qty} x ${money(unit)} = ${money(line)}`;
    });

    return [
      "TCDB CARD ORDER REQUEST",
      `Created: ${stamp}`,
      "",
      `Buyer: ${buyer}`,
      `Email: ${email}`,
      `Payment: ${payment}`,
      `Shipping preference: ${shipping.label}`,
      `Shipping estimate: ${shipping.estimate == null ? "Pending approval" : money(shipping.estimate)}`,
      `Shipping note: ${shipping.note}`,
      `Notes: ${notes}`,
      "",
      "Items:",
      ...(lines.length ? lines : ["(no items selected)"]),
      "",
      `Selected cards: ${selectedRows.length}`,
      `Selected units: ${units}`,
      `Cards subtotal (known prices): ${money(total)}`,
      `Known total + shipping estimate: ${knownWithShipping == null ? "Pending shipping approval" : money(knownWithShipping)}`,
      ...(missingPriceRows.length
        ? [`Unpriced items selected: ${missingPriceRows.length} card(s), ${missingPriceUnits} unit(s). Final card pricing will be sent for approval.`]
        : []),
    ].join("\n");
  }

  function buildCsv(selectedRows) {
    const header = ["Card Name", "Sport", "Set", "Card #", "Qty", "Unit Price", "Line Total", "Link"];
    const lines = [header.join(",")];

    for (const x of selectedRows) {
      const r = x.row;
      const unit = asNum(myPrice(r.tcdb_price), 0);
      const lineTotal = unit * x.qty;
      const cols = [
        r.card_name || r.player || "",
        r.sport || "",
        r.set_name || "",
        r.card_number || "",
        String(x.qty),
        unit.toFixed(2),
        lineTotal.toFixed(2),
        r.card_url || "",
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`);
      lines.push(cols.join(","));
    }

    return lines.join("\n");
  }

  function renderCart(selectedRows) {
    if (!selectedRows.length) {
      els.cartItems.innerHTML = '<p class="cart-empty">No cards selected yet.</p>';
      return;
    }

    els.cartItems.innerHTML = selectedRows
      .slice(0, 200)
      .map((x) => {
        const r = x.row;
        const name = escapeHtml(r.card_name || r.player || "(unnamed card)");
        const setText = escapeHtml(r.set_name || "(set unknown)");
        const cardNo = escapeHtml(r.card_number || "-");
        const unit = asNum(myPrice(r.tcdb_price), 0);
        const line = unit * x.qty;
        return `<div class="cart-row">
          <strong>${name}</strong>
          <span>${escapeHtml(r.sport || "")} | ${setText} #${cardNo}</span><br />
          <span>${x.qty} x ${money(unit)} = ${money(line)}</span>
        </div>`;
      })
      .join("");
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
        const key = rowKey(r);
        const name = r.card_name || r.player || "";
        const avail = Math.max(0, asNum(r.quantity, 1));
        const chosen = selectedQtyForRow(r);
        const unit = myPrice(r.tcdb_price);
        const qtyOptions = Array.from({ length: avail + 1 }, (_, n) =>
          `<option value="${n}" ${n === chosen ? "selected" : ""}>${n}</option>`
        ).join("");
        const line = unit == null ? null : unit * chosen;

        return `<tr>
          <td><select class="row-qty" data-row-key="${escapeAttr(key)}">${qtyOptions}</select></td>
          <td>${idx}</td>
          <td class="name">${escapeHtml(name)}</td>
          <td>${escapeHtml(r.sport || "")}</td>
          <td>${escapeHtml(r.set_name || "")}</td>
          <td>${escapeHtml(r.card_number || "")}</td>
          <td>${avail}</td>
          <td>${money(r.tcdb_price)}</td>
          <td>${money(unit)}</td>
          <td class="line-total">${money(line)}</td>
          <td>${href ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">Open</a>` : "-"}</td>
        </tr>`;
      })
      .join("");

    if (!pageRows.length) {
      els.rows.innerHTML = '<tr><td colspan="11">No matching cards.</td></tr>';
    }

    const selectedRows = getSelectedRows();
    const selectedUnits = selectedRows.reduce((s, x) => s + x.qty, 0);
    const selectedTotal = selectedRows.reduce((s, x) => s + asNum(myPrice(x.row.tcdb_price), 0) * x.qty, 0);

    els.shownCount.textContent = String(total);
    els.totalCount.textContent = String(state.rows.length);
    els.unitsCount.textContent = String(state.filtered.reduce((s, r) => s + asNum(r.quantity, 1), 0));
    els.selectedCount.textContent = String(selectedRows.length);
    els.selectedUnits.textContent = String(selectedUnits);
    els.selectedTotal.textContent = money(selectedTotal);

    els.pageInfo.textContent = `Page ${state.page} / ${pages}`;
    els.prevBtn.disabled = state.page <= 1;
    els.nextBtn.disabled = state.page >= pages;

    renderCart(selectedRows);
    els.orderPreview.textContent = buildOrderSummary(selectedRows);
  }

  async function loadDefault() {
    let failedDetails = [];
    setError("");
    setStatus("Loading default JSON files...");

    try {
      const defaultJsons = await discoverDefaultJsons();
      let loaded = [];
      let loadedNames = [];

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        loaded = [];
        loadedNames = [];
        failedDetails = [];

        for (const path of defaultJsons) {
          try {
            const res = await fetch(path, { cache: "no-store" });
            if (!res.ok) {
              failedDetails.push(`${path} (${res.status})`);
              continue;
            }
            const payload = await res.json();
            loaded.push(normalizePayload(payload));
            loadedNames.push(path);
          } catch (err) {
            failedDetails.push(`${path} (${err?.message || "fetch failed"})`);
          }
        }

        if (loaded.length) break;
        if (attempt < 3) {
          setStatus(`No JSON loaded yet. Retrying (${attempt}/2)...`);
          await delay(1000 * attempt);
        }
      }

      if (!loaded.length) throw new Error("No default JSON files found");

      state.rows = mergeRows(loaded);
      applyQuantityOverrides(state.rows);
      state.selectedQty.clear();
      refreshSportFilterOptions();
      setStatus(`Loaded ${state.rows.length} cards from ${loadedNames.length} file(s).`);
      applyFilters();
    } catch (_) {
      state.rows = [];
      state.filtered = [];
      state.selectedQty.clear();
      render();
      setStatus("Could not auto-load default JSON.");

      const isFileProtocol = window.location.protocol === "file:";
      const guidance = isFileProtocol
        ? "Opened via file://. Run a local server: `cd /Users/richardsmith/Documents/TCDB Inventory && python3 -m http.server 8000` then open http://localhost:8000/view.html."
        : "Try a hard refresh (Cmd+Shift+R). If hosted, JSON files may still be deploying.";
      const failureSample = failedDetails.length ? ` Failed: ${failedDetails.slice(0, 3).join("; ")}.` : "";
      setError(`${guidance}${failureSample}`);
    }
  }

  function bindEvents() {
    [
      els.q,
      els.minPrice,
      els.maxPrice,
      els.minQty,
      els.sortBy,
      els.sportFilter,
      els.pageSize,
      els.inStockOnly,
      els.selectedOnly,
    ].forEach((el) => {
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    });

    [els.checkoutName, els.checkoutEmail, els.checkoutPayment, els.checkoutShipping, els.checkoutNotes].forEach((el) => {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
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

    els.rows.addEventListener("change", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLSelectElement) || !target.classList.contains("row-qty")) return;
      const key = target.dataset.rowKey || "";
      if (!key) return;
      const qty = Math.max(0, asNum(target.value, 0));
      if (qty <= 0) state.selectedQty.delete(key);
      else state.selectedQty.set(key, qty);
      if (els.selectedOnly.checked) applyFilters();
      else render();
    });

    els.clearCartBtn.addEventListener("click", () => {
      state.selectedQty.clear();
      if (els.selectedOnly.checked) applyFilters();
      else render();
    });

    els.copyOrderBtn.addEventListener("click", async () => {
      const text = els.orderPreview.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Order summary copied to clipboard.");
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        setStatus("Order summary copied to clipboard.");
      }
    });

    els.emailOrderBtn.addEventListener("click", () => {
      const subject = encodeURIComponent("Card Order Request");
      const body = encodeURIComponent(els.orderPreview.textContent || "");
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    });

    els.downloadCsvBtn.addEventListener("click", () => {
      const selectedRows = getSelectedRows();
      const csv = buildCsv(selectedRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
      a.href = url;
      a.download = `tcdb-order-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("CSV downloaded.");
    });

    els.finalizeSaleBtn.addEventListener("click", () => {
      const selectedRows = getSelectedRows();
      if (!selectedRows.length) {
        setStatus("Select at least one card before finalizing a sale.");
        return;
      }

      const selectedUnits = selectedRows.reduce((s, x) => s + x.qty, 0);
      const ok = window.confirm(
        `Finalize sale for ${selectedRows.length} card(s) / ${selectedUnits} unit(s)? This will reduce available inventory in this browser.`
      );
      if (!ok) return;

      for (const x of selectedRows) {
        const r = x.row;
        const nextQty = Math.max(0, Math.floor(asNum(r.quantity, 0) - x.qty));
        r.quantity = nextQty;
        state.quantityOverrides.set(rowKey(r), nextQty);
      }
      saveQuantityOverrides();
      state.selectedQty.clear();

      if (els.selectedOnly.checked) applyFilters();
      else render();

      const subject = encodeURIComponent("New Card Order To Fulfill");
      const body = encodeURIComponent(
        `${buildOrderSummary(selectedRows)}\n\nInventory has been reduced locally in the store app.`
      );
      window.location.href = `mailto:${SELLER_CONFIRM_EMAIL}?subject=${subject}&body=${body}`;
      setStatus("Sale finalized. Inventory updated locally and seller email draft opened.");
    });
  }

  state.quantityOverrides = loadQuantityOverrides();
  bindEvents();
  loadDefault();
})();
