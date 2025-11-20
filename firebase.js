// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  getCountFromServer,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDukrt0fbcvgahbwAxiI-5NFHunsYEXdEQ",
  authDomain: "globeyh-5aabb.firebaseapp.com",
  projectId: "globeyh-5aabb",
  storageBucket: "globeyh-5aabb.firebasestorage.app",
  messagingSenderId: "422300739471",
  appId: "1:422300739471:web:0db5b16ee2017dbf650dfa"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ---------- utils ----------
const slug = (s) => (s || "")
  .toString()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .toLowerCase();

const findKey = (headers, candidates) =>
  headers.findIndex((h) => candidates.includes(h));

const splitCsvLine = (line) =>
  (line.match(/(?:"[^"]*"|[^,]+)/g) || []).map((v) =>
    v.trim().replace(/^"|"$/g, "")
  );

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---------- CSV upload (merge-only; never touches is_pinned/brand) ----------
const uploadCitiesFromCsv = async (file, onComplete) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
      if (lines.length < 2) throw new Error("CSV seems empty or missing rows.");

      const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      let cityIdx = findKey(headers, ["city", "name", "town"]);
      const latIdx = findKey(headers, ["lat", "latitude", "y"]);
      const lngIdx = findKey(headers, ["lng", "lon", "long", "longitude", "x"]);
      const countryIdx = findKey(headers, ["country", "country_name", "iso2", "iso3"]);

      if (cityIdx === -1 || latIdx === -1 || lngIdx === -1) {
        throw new Error("CSV needs headers: city, lat, lng (country optional).");
      }

      const rows = lines.slice(1).filter(Boolean);
      const docs = [];

      for (const line of rows) {
        const v = splitCsvLine(line);
        const city = v[cityIdx];
        const lat = parseFloat(v[latIdx]);
        const lng = parseFloat(v[lngIdx]);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

        const country = countryIdx !== -1 ? (v[countryIdx] || "") : "";
        const label = country ? `${city}, ${country}` : city;
        const id = `${slug(city)}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
        docs.push({ id, city, country, label, lat, lng });
      }

      let written = 0;
      for (const group of chunk(docs, 400)) {
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();
        for (const d of group) {
          batch.set(
            doc(db, "all_cities", d.id),
            {
              city: d.city,
              country: d.country,
              label: d.label,
              lat: d.lat,
              lng: d.lng,
              updated_at: nowIso
            },
            { merge: true }
          );
        }
        await batch.commit();
        written += group.length;
      }

      try {
        const c = await getCountFromServer(collection(db, "all_cities"));
        console.log("[COUNT] all_cities:", c.data().count);
      } catch {}

      onComplete?.(`Imported/updated: ${written}.`, "success");
    } catch (err) {
      console.error("[CSV IMPORT] Error:", err);
      onComplete?.(err.message || "Import failed.", "error");
    }
  };

  reader.readAsText(file);
};

// ---------- pin helpers ----------
const togglePinStatus = async (docId, currentStatus) => {
  await updateDoc(doc(db, "all_cities", docId), {
    is_pinned: !currentStatus
  });
};

// set explicit pin value (true/false)
const setPinStatus = async (docId, pinned) => {
  await setDoc(
    doc(db, "all_cities", docId),
    {
      is_pinned: !!pinned,
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );
};

// ---------- brand helpers (multi-brand support) ----------
const ALLOWED_BRANDS = ["academy", "federation", "plaza"];

const normalizeBrand = (brand) =>
  String(brand || "")
    .toLowerCase()
    .trim();

const assertBrand = (brand) => {
  const b = normalizeBrand(brand);
  if (!ALLOWED_BRANDS.includes(b)) {
    throw new Error("Invalid brand (use 'academy' | 'federation' | 'plaza').");
  }
  return b;
};

// Ensure a city has at least the chosen brand (does NOT change pin status)
const setCityBrand = async (docId, brand) => {
  const b = assertBrand(brand);
  await setDoc(
    doc(db, "all_cities", docId),
    {
      brand: b,
      // keep a historical array of all brands this location belongs to
      brands: arrayUnion(b),
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );
};

// Set brand + pin (used when branding an unpinned city)
const setCityBrandAndPin = async (docId, brand, pinned = true) => {
  const b = assertBrand(brand);
  await setDoc(
    doc(db, "all_cities", docId),
    {
      brand: b,
      brands: arrayUnion(b),
      is_pinned: !!pinned,
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );
};

// Optional helpers if you ever want to remove a specific brand from a city
const removeCityBrand = async (docId, brand) => {
  const b = assertBrand(brand);
  await setDoc(
    doc(db, "all_cities", docId),
    {
      brands: arrayRemove(b),
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );
};

// ---------- realtime ----------
const listenToCities = (callback, opts = {}) => {
  const { onlyPinned = false } = opts;
  const baseRef = collection(db, "all_cities");
  const qRef = onlyPinned ? query(baseRef, where("is_pinned", "==", true)) : baseRef;

  return onSnapshot(qRef, (snap) => {
    const cities = [];
    snap.forEach((d) => {
      const data = d.data();
      const pinned =
        data.is_pinned === true ||
        data.is_pinned === "true" ||
        data.is_pinned === 1;

      const rawBrands = Array.isArray(data.brands) ? data.brands : [];
      const single = data.brand ? [normalizeBrand(data.brand)] : [];
      const merged = [...rawBrands, ...single]
        .map(normalizeBrand)
        .filter((b) => !!b);
      const uniqueBrands = [...new Set(merged)];

      cities.push({
        id: d.id,
        label: data.label,
        lat: data.lat,
        lng: data.lng,
        is_pinned: pinned,
        // keep single brand for backward-compat / primary brand usage
        brand: uniqueBrands[0] || null,
        brands: uniqueBrands
      });
    });
    callback(cities);
  });
};

export {
  uploadCitiesFromCsv,
  togglePinStatus,
  setPinStatus,
  listenToCities,
  setCityBrand,
  setCityBrandAndPin,
  removeCityBrand
};
