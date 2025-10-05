import { uploadCitiesFromCsv, togglePinStatus, listenToCities } from "./firebase.js";
import { addStars, setupComets } from "./background-effects.js";

// ---------------------------
// Helpers
// ---------------------------
const slug = (s) =>
  (s || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const canonicalIdOf = (obj) => {
  const cityName = (obj.label || "").split(",")[0];
  const lat = Number(obj.lat);
  const lng = Number(obj.lng);
  return `${slug(cityName)}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
};

// STRICT selector: toggle only the exact Firestore doc; no "pinned duplicate" shortcut
const pickTargetDoc = (obj, all) => {
  if (obj.id) {
    const exact = all.find(x => x.id === obj.id);
    return { docId: obj.id, isPinned: !!(exact && exact.is_pinned) };
  }
  const cid = canonicalIdOf(obj);
  const found = all.find(x => x.id === cid);
  return { docId: cid, isPinned: !!(found && found.is_pinned) };
};

// ---------------------------
// Global state
// ---------------------------
let allCities = [];
let searchTimeout;

// Icons
const defaultPinUrl =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FFC300" stroke="white" stroke-width="10"/></svg>';
const customImageUrl = './assets/my-logo.png';

// Elements
const globeContainer   = document.getElementById('globeViz');
const uploadModal      = new bootstrap.Modal(document.getElementById('uploadModal'));
const pinningModal     = new bootstrap.Modal(document.getElementById('pinningModal'));

const searchInput      = document.getElementById('search-input');
const searchResultsList= document.getElementById('search-results');
const pinningModalText = document.getElementById('pinningModalText');
const pinningModalLabel= document.getElementById('pinningModalLabel');
const togglePinBtn     = document.getElementById('togglePinBtn');
const uploadBtn        = document.getElementById('uploadBtn');
const loadingSpinner   = document.getElementById('loading-spinner');
const statusMessage    = document.getElementById('statusMessage');
const csvFile          = document.getElementById('csvFile');

// ---------------------------
// UI text + Upload visibility for public
// ---------------------------
searchInput?.setAttribute('placeholder', 'Search location...');
if (uploadBtn) uploadBtn.textContent = 'Upload';

const isLocal     = ['localhost', '127.0.0.1'].includes(location.hostname);
const isAdminFlag = localStorage.getItem('yh_admin') === '1';
const canUpload   = isLocal || isAdminFlag;
const uploadGroup = document.getElementById('uploadControls') || uploadBtn?.parentElement;
if (uploadGroup && !canUpload) uploadGroup.style.display = 'none';

// ---------------------------
// Globe init
// ---------------------------
const world = Globe()(globeContainer)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .showGraticules(true)
  .showAtmosphere(true)
  .backgroundColor('#000011');

world.controls().autoRotate = false;
world.controls().autoRotateSpeed = 0.0;

// --- Embed support (optional) ---
const params = new URLSearchParams(location.search);
const EMBED = params.has('embed') || params.get('bg') === 'transparent';
if (EMBED) {
  world.backgroundColor('rgba(0,0,0,0)');
  globeContainer.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const searchWrap = document.querySelector('.search-bar-container');
  if (searchWrap) searchWrap.style.display = 'none';
  const up = document.getElementById('uploadControls');
  if (up) up.style.display = 'none';
}

// ---------------------------
// Render HTML markers (only pinned)
// ---------------------------
function renderGlobeMarkers(data) {
  world
    .htmlElementsData(data)
    .htmlElement(d => {
      const markerDiv = document.createElement('div');
      markerDiv.className = 'marker-container';

      const img = document.createElement('img');
      img.className = 'marker-icon';
      img.src = d.is_pinned ? customImageUrl : defaultPinUrl;

      img.onclick = (event) => {
        event.stopPropagation();

        // Only admins can open the pin dialog
        if (!isLocal && !isAdminFlag) return;

        const target = pickTargetDoc(d, allCities);
        const isPinned = !!target.isPinned;

        pinningModalLabel && (pinningModalLabel.textContent = 'Pin / Unpin Location');
        pinningModalText.textContent =
          `Do you want to toggle the pin status for ${d.label}? Current: ${isPinned ? 'Yes' : 'No'}.`;

        togglePinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
        togglePinBtn.classList.toggle('btn-danger', isPinned);
        togglePinBtn.classList.toggle('btn-primary', !isPinned);

        togglePinBtn.dataset.docId = target.docId;
        togglePinBtn.dataset.currentStatus = String(isPinned);

        pinningModal.show();
      };

      const label = document.createElement('span');
      label.className = 'marker-label';
      label.textContent = (d.label || '').split(',')[0];

      markerDiv.appendChild(img);
      markerDiv.appendChild(label);
      return markerDiv;
    })
    .htmlLat(d => d.lat)
    .htmlLng(d => d.lng)
    .htmlAltitude(0.005);
}

// ---------------------------
// Upload handler
// ---------------------------
uploadBtn?.addEventListener('click', async () => {
  const file = csvFile?.files?.[0];
  if (!file) {
    statusMessage.className = 'mt-3 text-danger';
    statusMessage.textContent = 'Please choose a CSV file first.';
    return;
  }

  uploadBtn.disabled = true;
  loadingSpinner.style.display = 'inline-block';
  statusMessage.className = 'mt-3 text-info';
  statusMessage.textContent = 'Uploading and writing to database...';

  await uploadCitiesFromCsv(file, (message, type) => {
    uploadBtn.disabled = false;
    loadingSpinner.style.display = 'none';

    Swal.fire({
      icon: type,
      title: type === 'success' ? 'Success!' : 'Notice',
      text: message
    });

    if (type === 'success') {
      uploadModal.hide();
      csvFile.value = '';
    }
  });
});

// ---------------------------
// Toggle pin write (admin-only)
// ---------------------------
togglePinBtn.addEventListener('click', async () => {
  if (!isLocal && !isAdminFlag) {
    alert('You do not have permission to pin/unpin locations.');
    return;
  }
  const docId = togglePinBtn.dataset.docId;
  const currentStatus = togglePinBtn.dataset.currentStatus === 'true';

  if (docId) {
    pinningModal.hide();
    await togglePinStatus(docId, currentStatus);
  }
});

// ---------------------------
// Realtime listener
// ---------------------------
window.onload = () => {
  try {
    listenToCities((cities) => {
      allCities = cities;
      const pinnedCities = allCities.filter(c => !!c.is_pinned);
      renderGlobeMarkers(pinnedCities);
      console.log(`[SNAPSHOT] total=${allCities.length} pinned=${pinnedCities.length}`);
    });
  } catch (error) {
    console.error("Error setting up Firestore listener:", error);
  }

  // Background effects
  if (world) {
    addStars(world);
    setupComets();
  }
};

// ---------------------------
// Search (debounced) — dedupe & prefer pinned
// ---------------------------
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchResultsList.style.display = 'none';
  const q = (searchInput.value || '').toLowerCase().trim();
  if (!q) return;

  searchTimeout = setTimeout(() => {
    try {
      const matches = allCities.filter(c => (c.label || '').toLowerCase().includes(q));
      const byId = new Map();
      for (const m of matches) {
        const cid = canonicalIdOf(m);
        const existing = byId.get(cid);
        if (!existing || (!!m.is_pinned && !existing.is_pinned)) {
          byId.set(cid, m);
        }
      }
      const results = Array.from(byId.values());
      displaySearchResults(results);
    } catch (e) {
      console.error("Error during search:", e);
    }
  }, 300);
});

function displaySearchResults(results) {
  try {
    searchResultsList.innerHTML = '';
    if (results.length > 0) {
      searchResultsList.style.display = 'block';
      results.slice(0, 10).forEach(city => {
        const li = document.createElement('li');
        li.textContent = city.label;
        li.onclick = () => {
          world.pointOfView({ lat: city.lat, lng: city.lng, altitude: 0.5 }, 1000);
          searchResultsList.style.display = 'none';
          searchInput.value = '';

          if (!isLocal && !isAdminFlag) return;

          const target = pickTargetDoc(city, allCities);
          const isPinned = !!target.isPinned;

          pinningModalLabel && (pinningModalLabel.textContent = 'Pin / Unpin Location');
          pinningModalText.textContent =
            `Do you want to toggle the pin status for ${city.label}? Current: ${isPinned ? 'Yes' : 'No'}.`;

          togglePinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
          togglePinBtn.classList.toggle('btn-danger', isPinned);
          togglePinBtn.classList.toggle('btn-primary', !isPinned);

          togglePinBtn.dataset.docId = target.docId;
          togglePinBtn.dataset.currentStatus = String(isPinned);

          pinningModal.show();
        };
        searchResultsList.appendChild(li);
      });
    } else {
      searchResultsList.style.display = 'none';
    }
  } catch (error) {
    console.error("Error displaying search results:", error);
  }
}
