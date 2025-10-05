// firebase.js (fixed)

// Firebase v12 ESM imports
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
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// *******************************************************************
// NOTE: keep your config here
// *******************************************************************
const firebaseConfig = {
  apiKey: "AIzaSyDukrt0fbcvgahbwAxiI-5NFHunsYEXdEQ",
  authDomain: "globeyh-5aabb.firebaseapp.com",
  projectId: "globeyh-5aabb",
  storageBucket: "globeyh-5aabb.firebasestorage.app",
  messagingSenderId: "422300739471",
  appId: "1:422300739471:web:0db5b16ee2017dbf650dfa"
};

// Init
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const slug = (s) => (s || "")
  .toString()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .toLowerCase();

const findKey = (headers, candidates) =>
  headers.findIndex(h => candidates.includes(h));

const splitCsvLine = (line) =>
  (line.match(/(?:"[^"]*"|[^,]+)/g) || [])
    .map(v => v.trim().replace(/^"|"$/g, ""));

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---------------------------------------------------------------
// CSV UPLOAD — MERGE-ONLY, NEVER touch `is_pinned`
// ---------------------------------------------------------------
const uploadCitiesFromCsv = async (file, onComplete) => {
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      if (lines.length < 2) throw new Error("CSV seems empty or missing rows.");

      const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
      const cityIdx    = findKey(headers, ["city","name","town"]);
      const latIdx     = findKey(headers, ["lat","latitude","y"]);
      const lngIdx     = findKey(headers, ["lng","lon","long","longitude","x"]);
      const countryIdx = findKey(headers, ["country","country_name","iso2","iso3"]); // optional
      if (cityIdx === -1 || latIdx === -1 || lngIdx === -1) {
        throw new Error("Ang CSV ay dapat may headers: city, lat, lng (country optional).");
      }

      const dataRows = lines.slice(1).filter(Boolean);
      const docs = [];
      for (const line of dataRows) {
        const values = splitCsvLine(line);
        const city = values[cityIdx];
        const lat  = parseFloat(values[latIdx]);
        const lng  = parseFloat(values[lngIdx]);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        const country = countryIdx !== -1 ? (values[countryIdx] || "") : "";
        const label = country ? `${city}, ${country}` : city;
        const id = `${slug(city)}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
        docs.push({ id, city, country, label, lat, lng });
      }

      let written = 0;
      for (const group of chunk(docs, 400)) {
        const batch = writeBatch(db);
        const nowIso = new Date().toISOString();
        for (const d of group) {
          // IMPORTANT: merge write; DO NOT include is_pinned here
          batch.set(doc(db, "all_cities", d.id), {
            city: d.city,
            country: d.country,
            label: d.label,
            lat: d.lat,
            lng: d.lng,
            updated_at: nowIso
          }, { merge: true });
        }
        await batch.commit();
        written += group.length;
      }

      try {
        const countSnap = await getCountFromServer(collection(db, "all_cities"));
        console.log("[COUNT] all_cities:", countSnap.data().count);
      } catch {}

      onComplete?.(`Imported/updated: ${written}.`, "success");
    } catch (err) {
      console.error("[CSV IMPORT] Error:", err);
      onComplete?.(err.message || "Import failed.", "error");
    }
  };

  reader.readAsText(file);
};

// ---------------------------------------------------------------
// Toggle pin status for a doc in all_cities
// ---------------------------------------------------------------
const togglePinStatus = async (docId, currentStatus) => {
  const ref = doc(db, "all_cities", docId);
  await updateDoc(ref, { is_pinned: !currentStatus });
};

// ---------------------------------------------------------------
// Real-time listener (correct boolean coercion)
// ---------------------------------------------------------------
const listenToCities = (callback, opts = {}) => {
  const { onlyPinned = false } = opts;
  const baseRef = collection(db, "all_cities");
  const qRef = onlyPinned ? query(baseRef, where("is_pinned", "==", true)) : baseRef;

  return onSnapshot(qRef, (snap) => {
    const cities = [];
    snap.forEach((d) => {
      const data = d.data();

      // STRICT coercion: true if true/'true'/1; otherwise false
      const pinned =
        data.is_pinned === true ||
        data.is_pinned === 'true' ||
        data.is_pinned === 1;

      cities.push({
        id: d.id,
        label: data.label,
        lat: data.lat,
        lng: data.lng,
        is_pinned: pinned
      });
    });
    callback(cities);
  });
};

export { uploadCitiesFromCsv, togglePinStatus, listenToCities };
