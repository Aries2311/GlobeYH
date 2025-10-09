import {
  uploadCitiesFromCsv,
  togglePinStatus,
  setPinStatus,
  listenToCities,
  setCityBrand,
  setCityBrandAndPin
} from "./firebase.js";
import { addStars, setupComets } from "./background-effects.js";

/* =========================
   CONFIG
   ========================= */
// Eksaktong GitHub Pages host mo
const DOMAIN_WHITELIST = [
  "aries2311.github.io"
];

// Project path sa GitHub Pages (dahil repo mo ay "GlobeYH")
const PATH_WHITELIST = [
  "/GlobeYH", "/GlobeYH/"
];

// Dev convenience: payagan full manage sa localhost
const DEV_ALLOW_LOCALHOST = true;

/* =========================
   ADMIN + DOMAIN/PATH GATING
   ========================= */
let IS_ADMIN = false;
let CAN_MANAGE = false; // final: puwedeng mag-search/pin/unpin/brand/upload

function computeHostGating() {
  const host = location.hostname.toLowerCase();
  const path = location.pathname || "/";
  const isWhitelistedHost = DOMAIN_WHITELIST.some(h =>
    host === h.toLowerCase() || host.endsWith("." + h.toLowerCase())
  );
  const isWhitelistedPath = PATH_WHITELIST.length
    ? PATH_WHITELIST.some(p => path === p || path.startsWith(p))
    : true;

  const isLocal = ["localhost","127.0.0.1","::1"].includes(host) || location.protocol === "file:";
  // ✅ Manage only kung (GitHub Pages host + tamang project path + admin) OR (localhost dev)
  CAN_MANAGE = (isWhitelistedHost && isWhitelistedPath && IS_ADMIN) || (isLocal && DEV_ALLOW_LOCALHOST);

  console.log("[GATING]", { host, path, IS_ADMIN, CAN_MANAGE, isWhitelistedHost, isWhitelistedPath });
}

async function resolveAdmin() {
  try {
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js");
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
      try {
        const devOverride = localStorage.getItem("yh_admin") === "1"; // dev only
        if (!user) {
          IS_ADMIN = devOverride; // not signed in
        } else {
          const token = await user.getIdTokenResult();
          IS_ADMIN = !!token.claims?.admin || devOverride;
        }
      } catch {
        IS_ADMIN = localStorage.getItem("yh_admin") === "1";
      }
      computeHostGating();
      applyAdminUI();
    });
  } catch {
    // No Auth loaded; fallback
    IS_ADMIN = localStorage.getItem("yh_admin") === "1";
    computeHostGating();
    applyAdminUI();
  }
}

/* =========================
   HELPERS & STATE
   ========================= */
const slug = (s) =>
  (s || "")
    .toString().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

const canonicalIdOf = (o) =>
  `${slug((o.city || o.label || "").split(",")[0])}_${Number(o.lat).toFixed(4)}_${Number(o.lng).toFixed(4)}`;

let allCities = [];    // full set (for search; lazy-hydrated)
let pinnedCities = []; // rendered set
let searchTimeout;
let hydratedAll = false;
let pendingCity = null; // <-- moved earlier to avoid TDZ confusion

// Icons & display
const FED_ICON = "./assets/my-logo.png";
const ACAD_ICON = "./assets/academy-logo.png";
const ICONS = { federation: FED_ICON, academy: ACAD_ICON };
const displayNameFor = (o) => {
  const base = (o.label || "").split(",")[0].trim();
  const b = String(o.brand || "").toLowerCase();
  if (b === "academy") return `${base} - Academy`;
  if (b === "federation") return `${base} - Federation`;
  return base;
};
const iconFor = (o) => ICONS[String(o.brand || "").toLowerCase()] || FED_ICON;

/* =========================
   DOM ELEMENTS
   ========================= */
const globeContainer = document.getElementById("globeViz");
const uploadModal = new bootstrap.Modal(document.getElementById("uploadModal"));
const pinningModal = new bootstrap.Modal(document.getElementById("pinningModal"));

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

// Auto-create Unpin if missing (harmless for viewers)
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

/* =========================
   ADMIN / VIEWER UI
   ========================= */
function applyAdminUI() {
  // Show/Hide Upload controls
  const uploadGroup = document.getElementById("uploadControls") || uploadBtn?.parentElement;
  if (uploadGroup) uploadGroup.style.display = CAN_MANAGE ? "block" : "none";

  // Show/Hide search UI for viewers (READ-ONLY site => hide search entirely)
  const searchBar = document.querySelector(".search-bar-container");
  if (searchBar) searchBar.style.display = CAN_MANAGE ? "flex" : "none";

  // Optional: lock globe for viewers (uncomment if gusto mong frozen ang globe sa viewers)
  // if (!CAN_MANAGE) {
  //   const c = world.controls();
  //   c.enablePan = false;
  //   c.enableZoom = true;   // set to false kung gusto mo walang zoom
  //   c.enableRotate = true; // set to false kung gusto mo totally static
  // }
}

/* =========================
   GLOBE INIT
   ========================= */
const world = Globe()(globeContainer)
  .globeImageUrl("//unpkg.com/three-globe/example/img/earth-day.jpg")
  .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
  .showGraticules(true)
  .showAtmosphere(true)
  .backgroundColor("#000011");

setTimeout(() => { try{addStars(world);}catch{} try{setupComets();}catch{} }, 600);

// Controls & URL flag
(world.controls().autoRotate = false), (world.controls().autoRotateSpeed = 0.0);
const urlParams = new URLSearchParams(location.search);
const NO_ZOOM = urlParams.has("nozoom") || urlParams.get("zoom") === "0";
const ctrl = world.controls();
if (NO_ZOOM) {
  ctrl.enableZoom = false;
  const cam = world.camera(); const dist = cam.position.length();
  ctrl.minDistance = dist; ctrl.maxDistance = dist;
  const dom = world.renderer().domElement;
  dom.addEventListener("touchmove",(e)=>{if(e.touches?.length>=2){e.preventDefault();e.stopPropagation();}},{passive:false});
}

/* =========================
   PIN MODAL (CAN_MANAGE only)
   ========================= */
togglePinBtn?.addEventListener("click", async () => {
  if (!CAN_MANAGE) return;
  const docId = togglePinBtn.dataset.docId;
  const cur = togglePinBtn.dataset.currentStatus === "true";
  togglePinBtn.disabled = true;
  try { await togglePinStatus(docId, cur); pinningModal.hide(); }
  catch (e) { Swal.fire({ icon:"error", title:"Oops", text: e?.message || "Failed to toggle pin." }); }
  finally { togglePinBtn.disabled = false; }
});

/* =========================
   SEARCH (only when CAN_MANAGE)
   ========================= */
const ensureHydratedAllCities = () => {
  if (hydratedAll) return;
  hydratedAll = true;
  listenToCities((cities) => { allCities = cities; }); // full set for search only
};

if (searchInput) {
  searchInput.addEventListener("focus", () => { if (CAN_MANAGE) ensureHydratedAllCities(); });
  searchInput.addEventListener("input", () => {
    if (!CAN_MANAGE) return;
    ensureHydratedAllCities();
    clearTimeout(searchTimeout);
    const value = (searchInput.value || "").toLowerCase().trim();
    if (!value) { searchResultsList.style.display = "none"; return; }
    searchTimeout = setTimeout(() => {
      const q = (searchInput.value || "").toLowerCase().trim(); if (!q) return;
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
  if (!CAN_MANAGE) return;
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

      // Manage modal (brand/unpin) — only for CAN_MANAGE
      if (brandModal && CAN_MANAGE) {
        const base = (city.label || "").split(",")[0].trim();
        const unpinBtn = document.getElementById("chooseUnpinBtn");
        if (unpinBtn) unpinBtn.style.display = city.is_pinned ? "inline-block" : "none";
        brandModalText && (brandModalText.textContent = `Manage “${base}”: choose brand or unpin.`);
        pendingCity = city;
        brandModal.show();
      }
    };
    searchResultsList.appendChild(li);
  });
}

/* =========================
   RENDER (pinned only)
   ========================= */
function renderGlobeMarkers(data) {
  world
    .htmlElementsData(data)
    .htmlElement((d) => {
      const wrap = document.createElement("div");
      wrap.className = "marker-container";
      const img = document.createElement("img");
      img.className = "marker-icon";
      img.src = iconFor(d);

      img.onclick = (e) => {
        e.stopPropagation();
        if (!CAN_MANAGE) return; // viewers: do nothing
        const id = canonicalIdOf(d);
        const isPinned = !!d.is_pinned;
        pinningModalLabel && (pinningModalLabel.textContent = "Pin / Unpin Location");
        pinningModalText.textContent =
          `Do you want to toggle the pin status for ${displayNameFor(d)}? Current: ${isPinned ? "Yes" : "No"}`;
        togglePinBtn.textContent = isPinned ? "Unpin" : "Pin";
        togglePinBtn.classList.toggle("btn-danger", isPinned);
        togglePinBtn.classList.toggle("btn-primary", !isPinned);
        togglePinBtn.dataset.docId = id;
        togglePinBtn.dataset.currentStatus = String(isPinned);
        pinningModal.show();
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
    .htmlAltitude(0.005);
}

/* =========================
   BRAND / UNPIN (CAN_MANAGE only)
   ========================= */
async function applyBrandChoice(brand, cityObj = null) {
  if (!CAN_MANAGE) return;
  try {
    const c = cityObj || pendingCity;
    if (!c) return;
    const docId = c.id || canonicalIdOf(c);
    if (!c.is_pinned) await setCityBrandAndPin(docId, brand, true);
    else await setCityBrand(docId, brand);
    brandModal && brandModal.hide();
  } catch (e) {
    Swal.fire({ icon: "error", title: "Oops", text: e?.message || e?.code || "Failed to set brand." });
  } finally { pendingCity = null; }
}
async function unpinChosenCity() {
  if (!CAN_MANAGE) return;
  try {
    if (!pendingCity) return;
    const docId = pendingCity.id || canonicalIdOf(pendingCity);
    await setPinStatus(docId, false);
    brandModal && brandModal.hide();
  } catch (e) {
    Swal.fire({ icon: "error", title: "Oops", text: e?.message || e?.code || "Failed to unpin." });
  } finally { pendingCity = null; }
}
document.getElementById("chooseAcademyBtn")?.addEventListener("click", () => applyBrandChoice("academy"));
document.getElementById("chooseFederationBtn")?.addEventListener("click", () => applyBrandChoice("federation"));
document.getElementById("chooseUnpinBtn")?.addEventListener("click", unpinChosenCity);

/* =========================
   UPLOAD (CAN_MANAGE only)
   ========================= */
uploadBtn?.addEventListener("click", async () => {
  if (!CAN_MANAGE) return;
  const file = csvFile?.files?.[0];
  if (!file) { statusMessage.className = "mt-3 text-danger"; statusMessage.textContent = "Please choose a CSV file first."; return; }
  uploadBtn.disabled = true; loadingSpinner.style.display = "inline-block";
  statusMessage.className = "mt-3 text-info"; statusMessage.textContent = "Uploading and writing to database...";
  await uploadCitiesFromCsv(file, (message, type) => {
    uploadBtn.disabled = false; loadingSpinner.style.display = "none";
    Swal.fire({ icon: type, title: type === "success" ? "Success!" : "Notice", text: message || "Done.", confirmButtonText: "OK", heightAuto: false });
  });
});

/* =========================
   REALTIME
   ========================= */
window.onload = () => {
  computeHostGating();  // set host/path flags asap
  resolveAdmin();       // then compute admin + finalize CAN_MANAGE

  // Fast first paint: pinned-only render
  listenToCities((cities) => {
    pinnedCities = cities;
    renderGlobeMarkers(pinnedCities);
    console.log(`[SNAPSHOT] pinned=${pinnedCities.length}`);
  }, { onlyPinned: true });
};
