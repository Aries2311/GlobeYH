import {
  uploadCitiesFromCsv,
  togglePinStatus,
  setPinStatus,
  listenToCities,
  setCityBrand,
  setCityBrandAndPin
} from "./firebase.js";

const ALWAYS_MANAGE_ON_SEARCH = true;

// ================================================
// EMBED detection + admin gating (auto-iframe aware)
// ================================================
const urlParams = new URLSearchParams(location.search);
const rawEmbed = (urlParams.get("embed") || "").toLowerCase();

// NEW: explicit no-UI switch via URL (?noui=1 or ?ui=0)
const NO_UI =
  (urlParams.get("noui") || "").toLowerCase() === "1" ||
  (urlParams.get("ui") || "").toLowerCase() === "0";

const IN_IFRAME = (() => {
  try { return window.self !== window.top; }
  catch (e) { return true; } // cross-origin iframes throw -> treat as iframe
})();

const EMBED =
  IN_IFRAME ||
  rawEmbed === "1" ||
  rawEmbed === "true" ||
  (rawEmbed !== "" && rawEmbed !== "0" && rawEmbed !== "false") ||
  NO_UI;

if (EMBED) document.documentElement.classList.add("embed");

// Background + zoom query flags
const TRANSPARENT_BG =
  EMBED || (urlParams.get("bg") || "").toLowerCase() === "transparent";
const NO_ZOOM = urlParams.has("nozoom") || urlParams.get("zoom") === "0";

// ---------- helpers ----------
const slug = (s) =>
  (s || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const canonicalIdOf = (o) =>
  `${slug((o.city || o.label || "").split(",")[0])}_${Number(o.lat).toFixed(4)}_${Number(o.lng).toFixed(4)}`;

let allCities = [];     // full list (hydrated on demand)
let pinnedCities = [];  // current pinned
let searchTimeout;
let unsubAll = null;    // listener for ALL cities (lazy)
let hydratedAll = false;

// ===== Richest layer state (Top 150) =====
let showRichest = true;   // toggle ON/OFF (default ON)
let richestCities = [];   // parsed from inline JSON/CSV
let richestLoaded = false;

// ---------- icons & display ----------
const FED_ICON = "./assets/federation-logo.png";
const ACAD_ICON = "./assets/academy-logo.png";
const PLAZA_ICON = "./assets/plaza-logo.png";

const ICONS = { federation: FED_ICON, academy: ACAD_ICON, plaza: PLAZA_ICON };

const displayNameFor = (o) => {
  const base = (o.label || "").split(",")[0].trim();
  const b = String(o.brand || "").toLowerCase();
  if (b === "academy") return `${base} - Academy`;
  if (b === "federation") return `${base} - Federation`;
  if (b === "plaza") return `${base} - Plaza`;
  return base;
};

const iconFor = (o) => ICONS[String(o.brand || "").toLowerCase()] || FED_ICON;

// ===== NEW: bigger brand icons on live GitHub Pages =====
const IS_GHPAGES = /github\.io$/i.test(location.hostname);
const ICON_PX_OVERRIDE = parseInt(urlParams.get("iconsize") || "", 10);
const BRAND_ICON_SIZE = Number.isFinite(ICON_PX_OVERRIDE)
  ? ICON_PX_OVERRIDE
  : (IS_GHPAGES ? 52 : 40); // live: 52px, local/default: 40px

// ---------- elements ----------
const globeContainer = document.getElementById("globeViz");
const uploadModal = document.getElementById("uploadModal")
  ? new bootstrap.Modal(document.getElementById("uploadModal"))
  : null;
const pinningModal = document.getElementById("pinningModal")
  ? new bootstrap.Modal(document.getElementById("pinningModal"))
  : null;
const searchInput = document.getElementById("search-input");
const searchResultsList = document.getElementById("search-results");
const pinningModalText = document.getElementById("pinningModalText");
const pinningModalLabel = document.getElementById("pinningModalLabel");
const togglePinBtn = document.getElementById("togglePinBtn");
const uploadBtn = document.getElementById("uploadBtn");
const loadingSpinner = document.getElementById("loading-spinner");
const statusMessage = document.getElementById("statusMessage");
const csvFile = document.getElementById("csvFile");
const brandModalEl = document.getElementById("brandModal");
const brandModal = brandModalEl ? new bootstrap.Modal(brandModalEl) : null;
const brandModalText = document.getElementById("brandModalText");
let chooseFederationBtn = document.getElementById("chooseFederationBtn");
let chooseAcademyBtn = document.getElementById("chooseAcademyBtn");
let chooseUnpinBtn = document.getElementById("chooseUnpinBtn");
let choosePlazaBtn = document.getElementById("choosePlazaBtn");

// auto-create Unpin button if missing (safety)
if (brandModalEl && !chooseUnpinBtn) {
  const footer = brandModalEl.querySelector(".modal-footer");
  if (footer) {
    chooseUnpinBtn = document.createElement("button");
    chooseUnpinBtn.type = "button";
    chooseUnpinBtn.className = "btn btn-danger";
    chooseUnpinBtn.id = "chooseUnpinBtn";
    chooseUnpinBtn.textContent = "Unpin";
    chooseUnpinBtn.style.display = "none";
    const before = footer.querySelector("#chooseFederationBtn");
    before ? footer.insertBefore(chooseUnpinBtn, before) : footer.appendChild(chooseUnpinBtn);
  }
}

let pendingCity = null;

// ---------- admin gating ----------
const isLocal =
  ["localhost", "127.0.0.1", "::1"].includes(location.hostname) ||
  location.protocol === "file:";
const isAdminFlag = localStorage.getItem("yh_admin") === "1";

// Never allow upload/search controls to render while EMBED
const canUpload = !EMBED && (isLocal || isAdminFlag);
const uploadGroup =
  document.getElementById("uploadControls") || uploadBtn?.parentElement;
if (uploadGroup && !canUpload) uploadGroup.style.display = "none";

// ---------- globe ----------
const world = Globe()(globeContainer)
  .globeImageUrl("//unpkg.com/three-globe/example/img/earth-day.jpg")
  .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
  .showGraticules(true)
  .showAtmosphere(true);

// Transparent background (embed)
if (TRANSPARENT_BG) {
  try {
    world.scene().background = null;
    const r = world.renderer();
    r.setClearColor(0x000000, 0);
    r.setClearAlpha(0);
    globeContainer.style.background = "transparent";
    document.body.style.background = "transparent";
  } catch (e) {}
} else {
  world.backgroundColor("#000000ff");
}

// Controls
(world.controls().autoRotate = false), (world.controls().autoRotateSpeed = 0.0);
const ctrl = world.controls();
if (NO_ZOOM) {
  ctrl.enableZoom = false;
  const cam = world.camera();
  const dist = cam.position.length();
  ctrl.minDistance = dist;
  ctrl.maxDistance = dist;
  const dom = world.renderer().domElement;
  dom.addEventListener("touchmove", (e) => {
    if (e.touches?.length >= 2) { e.preventDefault(); e.stopPropagation(); }
  }, { passive: false });
}

// ===== Legacy Top 30 helpers (kept as fallback) =====
function parseTop30FromJSON() {
  try {
    const el = document.getElementById("top30RichestJSON");
    if (!el) return false;
    const arr = JSON.parse(el.textContent || "[]");
    richestCities = (arr || [])
      .map((o) => ({ ...o, richest: true }))  // map to richest flag
      .filter((o) => o && o.city && !Number.isNaN(Number(o.lat)) && !Number.isNaN(Number(o.lng)));
    richestLoaded = richestCities.length > 0;
    return richestLoaded;
  } catch (e) {
    console.warn("[richest/top30] JSON parse failed", e);
    return false;
  }
}

// tiny CSV parser (generic)
function parseCsv(text) {
  const lines = (text || "").split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const split = (line) => (line.match(/(?:"[^"]*"|[^,]+)/g) || []).map((v) => v.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const idx = { city: headers.indexOf("city"), lat: headers.indexOf("lat"), lng: headers.indexOf("lng"), country: headers.indexOf("country") };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const v = split(lines[i]);
    const city = v[idx.city]; const lat = Number(v[idx.lat]); const lng = Number(v[idx.lng]);
    if (!city || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    rows.push({ city, lat, lng, country: idx.country !== -1 ? v[idx.country] || "" : "" });
  }
  return rows;
}

// NEW: Richest loader (Top 150 first; with fallbacks)
async function loadRichest() {
  // 1) Try inline JSON for Top 150
  try {
    const el = document.getElementById("richestCitiesJSON");
    if (el) {
      const arr = JSON.parse(el.textContent || "[]");
      if (Array.isArray(arr) && arr.length > 0) {
        richestCities = arr.map((o) => ({ ...o, richest: true }));
        richestLoaded = richestCities.length > 0;
      }
    }
  } catch (e) { console.warn("[richest] inline JSON parse failed", e); }

  // 2) Try CSV files (preferred: top150)
  if (!richestLoaded) {
    // include top150_major_cities.csv first
    const tryFiles = ["top150_major_cities.csv", "top150_richest_cities.csv", "richest_cities.csv", "top30_richest_cities.csv"];
    for (const f of tryFiles) {
      try {
        const res = await fetch(f, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        const parsed = parseCsv(text);
        if (parsed.length) {
          richestCities = parsed.map((o) => ({ ...o, richest: true }));
          richestLoaded = true;
          break;
        }
      } catch (e) { /* keep trying next file */ }
    }
  }

  // 3) Legacy inline Top 30 fallback
  if (!richestLoaded) {
    parseTop30FromJSON();
  }

  refreshCombinedRender();
}

function mergeByCanonical(a, b) {
  const map = new Map();
  (a || []).forEach((o) => map.set(canonicalIdOf(o), o));
  (b || []).forEach((o) => {
    const k = canonicalIdOf(o);
    if (!map.has(k)) map.set(k, o); // keep pinned when conflict
  });
  return Array.from(map.values());
}

function combinedData() {
  return showRichest && richestCities?.length
    ? mergeByCanonical(pinnedCities || [], richestCities || [])
    : pinnedCities || [];
}

function refreshCombinedRender() {
  renderGlobeMarkers(combinedData());
}

// ---------- pin modal ----------
togglePinBtn?.addEventListener("click", async () => {
  const docId = togglePinBtn.dataset.docId;
  const cur = togglePinBtn.dataset.currentStatus === "true";
  togglePinBtn.disabled = true;
  try {
    await togglePinStatus(docId, cur);
    pinningModal?.hide();
  } catch (e) {
    Swal.fire({ icon: "error", title: "Oops", text: e?.message || "Failed to toggle pin." });
  } finally {
    togglePinBtn.disabled = false;
  }
});

// ---------- search (lazy-hydrate ALL cities on first intent) ----------
const ensureHydratedAllCities = () => {
  if (hydratedAll) return;
  hydratedAll = true;
  unsubAll = listenToCities((cities) => { allCities = cities; });
};

if (!EMBED) {
  searchInput?.addEventListener("focus", ensureHydratedAllCities);
  searchInput?.addEventListener("input", () => {
    ensureHydratedAllCities();
    clearTimeout(searchTimeout);
    const value = (searchInput.value || "").toLowerCase().trim();
    if (!value) { searchResultsList.style.display = "none"; return; }
    searchTimeout = setTimeout(() => {
      const q = (searchInput.value || "").toLowerCase().trim();
      if (!q) return;
      const source = hydratedAll ? allCities : pinnedCities;
      const matches = source.filter((c) => (c.label || "").toLowerCase().includes(q));
      const byId = new Map();
      for (const m of matches) {
        const cid = canonicalIdOf(m);
        const existing = byId.get(cid);
        if (!existing || (!!m.is_pinned && !existing.is_pinned)) byId.set(cid, m);
      }
      displaySearchResults(Array.from(byId.values()));
    }, 220);
  });
}

function displaySearchResults(results) {
  if (EMBED) return;
  searchResultsList.innerHTML = "";
  if (!results?.length) { searchResultsList.style.display = "none"; return; }
  searchResultsList.style.display = "block";
  results.slice(0, 10).forEach((city) => {
    const li = document.createElement("li");
    li.textContent = displayNameFor(city);
    li.onclick = () => {
      const currentPOV = world.pointOfView ? world.pointOfView() : { altitude: 0.5 };
      world.pointOfView({ lat: city.lat, lng: city.lng, altitude: NO_ZOOM ? currentPOV.altitude : 0.5 }, 1000);
      searchResultsList.style.display = "none";
      searchInput.value = "";

      if (brandModal && ALWAYS_MANAGE_ON_SEARCH) {
        pendingCity = city;
        const base = (city.label || "").split(",")[0].trim();
        brandModalText && (brandModalText.textContent = `Manage “${base}”: choose brand or unpin.`);
        const unpinBtn = document.getElementById("chooseUnpinBtn");
        if (unpinBtn) unpinBtn.style.display = city.is_pinned ? "inline-block" : "none";
        brandModal.show();
      }
    };
    searchResultsList.appendChild(li);
  });
}

// ---------- render (combined: pinned + richest) ----------
function renderGlobeMarkers(data) {
  world
    .htmlElementsData(data)
    .htmlElement((d) => {
      // Richest markers: LABEL ONLY (gold), NO DOT
      if (d.richest && !d.is_pinned) {
        const wrap = document.createElement("div");
        wrap.className = "marker-container";
        wrap.style.pointerEvents = "auto";
        wrap.style.cursor = "pointer";

        const label = document.createElement("div");
        label.textContent = d.city;
        label.className = "marker-label richest"; // gold color via CSS
        wrap.appendChild(label);

        wrap.addEventListener("click", () => {
          const currentPOV = world.pointOfView ? world.pointOfView() : { altitude: 0.6 };
          world.pointOfView(
            { lat: d.lat, lng: d.lng, altitude: NO_ZOOM ? currentPOV.altitude : 0.6 },
            900
          );
        });
        return wrap;
      }

      // PINNED markers: icon + brand label (existing behavior)
      const wrap = document.createElement("div");
      wrap.className = "marker-container";

      const img = document.createElement("img");
      img.className = "marker-icon";
      img.src = iconFor(d);

      // NEW: enlarge brand icons on live site (or via ?iconsize=XX)
      img.style.width = `${BRAND_ICON_SIZE}px`;
      img.style.height = `${BRAND_ICON_SIZE}px`;

      img.onclick = (e) => {
        e.stopPropagation();
        if (EMBED || (!isLocal && !isAdminFlag)) return;
        const id = canonicalIdOf(d);
        const isPinned = !!d.is_pinned;
        pinningModalLabel && (pinningModalLabel.textContent = "Pin / Unpin Location");
        pinningModalText.textContent = `Do you want to toggle the pin status for ${displayNameFor(d)}? Current: ${isPinned ? "Yes" : "No"}`;
        togglePinBtn.textContent = isPinned ? "Unpin" : "Pin";
        togglePinBtn.classList.toggle("btn-danger", isPinned);
        togglePinBtn.classList.toggle("btn-primary", !isPinned);
        togglePinBtn.dataset.docId = id;
        togglePinBtn.dataset.currentStatus = String(isPinned);
        pinningModal?.show();
      };

      const label = document.createElement("span");
      label.className = "marker-label";
      label.textContent = displayNameFor(d);

      wrap.appendChild(img);
      wrap.appendChild(label);
      return wrap;
    })
    .htmlLat((d) => d.lat)
    .htmlLng((d) => d.lng)
    .htmlAltitude((d) => (d.richest && !d.is_pinned ? 0.004 : 0.005));
}

// ---------- brand/unpin actions ----------
async function applyBrandChoice(brand, cityObj = null) {
  try {
    const c = cityObj || pendingCity;
    if (!c) return;
    const docId = c.id || canonicalIdOf(c);
    if (!c.is_pinned) {
      await setCityBrandAndPin(docId, brand, true);
    } else {
      await setCityBrand(docId, brand);
    }
    brandModal && brandModal.hide();
  } catch (e) {
    Swal.fire({ icon: "error", title: "Oops", text: e?.message || e?.code || "Failed to set brand." });
  } finally {
    pendingCity = null;
  }
}
async function unpinChosenCity() {
  try {
    if (!pendingCity) return;
    const docId = pendingCity.id || canonicalIdOf(pendingCity);
    await setPinStatus(docId, false);
    brandModal && brandModal.hide();
  } catch (e) {
    Swal.fire({ icon: "error", title: "Oops", text: e?.message || e?.code || "Failed to unpin." });
  } finally {
    pendingCity = null;
  }
}
document.getElementById("chooseAcademyBtn")?.addEventListener("click", () => applyBrandChoice("academy"));
document.getElementById("chooseFederationBtn")?.addEventListener("click", () => applyBrandChoice("federation"));
document.getElementById("choosePlazaBtn")?.addEventListener("click", () => applyBrandChoice("plaza"));
document.getElementById("chooseUnpinBtn")?.addEventListener("click", unpinChosenCity);

// ---------- upload ----------
if (uploadBtn && !EMBED) {
  uploadBtn.addEventListener("click", async () => {
    const file = csvFile?.files?.[0];
    if (!file) { statusMessage.className = "mt-3 text-danger"; statusMessage.textContent = "Please choose a CSV file first."; return; }
    uploadBtn.disabled = true;
    loadingSpinner.style.display = "inline-block";
    statusMessage.className = "mt-3 text-info";
    statusMessage.textContent = "Uploading and writing to database...";
    await uploadCitiesFromCsv(file, (message, type) => {
      uploadBtn.disabled = false;
      loadingSpinner.style.display = "none";
      Swal.fire({ icon: type, title: type === "success" ? "Success!" : "Notice", text: message || "Done.", confirmButtonText: "OK", heightAuto: false });
    });
  });
}

// ---------- realtime ----------
window.onload = () => {
  // Subscribe to pinned only for first render
  listenToCities(
    (cities) => {
      pinnedCities = cities;
      refreshCombinedRender(); // render pinned + richest (if loaded)
      console.log(`[SNAPSHOT] pinned=${pinnedCities.length}`);
    },
    { onlyPinned: true }
  );

  // Load Richest (Top 150 preferred)
  loadRichest();

  // Setup Richest toggle
  const btnTop = document.getElementById("btnRichest");
  if (btnTop) {
    const reflect = () => {
      btnTop.classList.toggle("btn-outline-info", showRichest);
      btnTop.classList.toggle("btn-secondary", !showRichest);
      btnTop.innerHTML = showRichest ? '<i class="fa-solid fa-trophy"></i> Top 150'
                                     : '<i class="fa-solid fa-trophy"></i> Top 150 (off)';
    };
    reflect();
    btnTop.addEventListener("click", () => {
      showRichest = !showRichest;
      reflect();
      refreshCombinedRender();
    });
  }
};

// ---------- final UI hiding for EMBED ----------
const searchContainer = document.querySelector(".search-bar-container");
if (searchContainer && EMBED) {
  searchContainer.style.display = "none";
  const sr = document.getElementById("search-results");
  if (sr) sr.style.display = "none";
}
if (EMBED) {
  const uiContainer = document.querySelector(".ui-container");
  const searchResults = document.getElementById("search-results");
  const uploadControls = document.getElementById("uploadControls");
  if (uiContainer) uiContainer.style.display = "none";
  if (searchResults) searchResults.style.display = "none";
  if (uploadControls) uploadControls.style.display = "none";
  document.querySelectorAll(".modal, .modal-backdrop").forEach((el) => (el.style.display = "none"));
}
