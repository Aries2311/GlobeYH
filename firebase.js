// firebase.js (updated)

// Firebase v12 ESM imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  getDocs,
  getCountFromServer,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// *******************************************************************
// NOTE: Palitan lang kung iba ang config mo. Same values will work.
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
// Helper utils
// ---------------------------------------------------------------
const slug = (s) => (s || "")
  .toString()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .toLowerCase();

// Flexible CSV header finder
const findKey = (headers, candidates) =>
  headers.findIndex(h => candidates.includes(h));

// Light CSV split that respects simple quotes
const splitCsvLine = (line) =>
  (line.match(/(?:"[^"]*"|[^,]+)/g) || [])
    .map(v => v.trim().replace(/^"|"$/g, ""));

// Chunk helper
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---------------------------------------------------------------
// CSV UPLOAD (throttled + retries + RESUME CHECKPOINT)
// ---------------------------------------------------------------
const uploadCitiesFromCsv = async (file, onComplete) => {
  const reader = new FileReader();
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const CP_KEY = "yh_import_checkpoint"; // localStorage key

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

      const ROWS_PER_BATCH = 200;
      const BASE_DELAY_MS  = 600;
      const MAX_DELAY_MS   = 8000;
      const MAX_RETRIES    = 6;

      // DATA + CHECKPOINT
      const dataRows = lines.slice(1);
      const total = dataRows.length;
      let offset = parseInt(localStorage.getItem(CP_KEY) || "0", 10);
      if (Number.isNaN(offset) || offset < 0) offset = 0;
      if (offset >= total) offset = 0; // safety reset if file changed

      let written = 0, malformed = 0;

      console.log(`[CSV IMPORT] Starting at row index ${offset} of ${total}`);

      // Pre-scan current chunk to count malformed (for resume visibility)
      const isRowValid = (values) => {
        if (values.length <= Math.max(cityIdx, latIdx, lngIdx)) return false;
        const city = values[cityIdx];
        const lat  = parseFloat(values[latIdx]);
        const lng  = parseFloat(values[lngIdx]);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        return true;
      };

      for (; offset < total; offset += ROWS_PER_BATCH) {
        const linesChunk = dataRows.slice(offset, offset + ROWS_PER_BATCH);

        const docs = [];
        for (const line of linesChunk) {
          const values = splitCsvLine(line);
          if (!isRowValid(values)) { malformed++; continue; }
          const city = values[cityIdx];
          const lat  = parseFloat(values[latIdx]);
          const lng  = parseFloat(values[lngIdx]);
          const country = countryIdx !== -1 ? (values[countryIdx] || "") : "";
          const label = country ? `${city}, ${country}` : city;
          const id = `${slug(city)}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
          docs.push({ id, city, country, label, lat, lng });
        }

        let attempt = 0, delay = BASE_DELAY_MS;
        while (true) {
          try {
            const batch = writeBatch(db);
            for (const d of docs) {
              batch.set(doc(db, "all_cities", d.id), {
                city: d.city,
                country: d.country,
                label: d.label,
                lat: d.lat,
                lng: d.lng,
                is_pinned: false,
                updated_at: new Date().toISOString()
              }, { merge: true });
            }
            await batch.commit();
            written += docs.length;

            // SAVE CHECKPOINT (next offset)
            localStorage.setItem(CP_KEY, String(offset + ROWS_PER_BATCH));

            console.log(`[CSV IMPORT] progress: ${Math.min(offset + ROWS_PER_BATCH, total)}/${total}`);
            await sleep(BASE_DELAY_MS);
            break;
          } catch (err) {
            const msg = (err && (err.code || err.message || "")).toString();
            const exhausted = msg.includes("resource-exhausted") || msg.includes("Quota exceeded");
            if (exhausted && attempt < MAX_RETRIES) {
              attempt++;
              console.warn(`[CSV IMPORT] resource-exhausted; retry #${attempt} after ${delay}ms`);
              await sleep(delay);
              delay = Math.min(delay * 2, MAX_DELAY_MS);
              continue;
            }
            if (exhausted) {
              // Keep checkpoint so we can resume tomorrow at same offset
              onComplete?.(
                `Naabot ang daily write quota. Progress saved at row ${offset}. Please resume bukas.`,
                "error"
              );
              return;
            }
            throw err;
          }
        }
      }

      // COMPLETE — clear checkpoint
      localStorage.removeItem(CP_KEY);

      try {
        const countSnap = await getCountFromServer(collection(db, "all_cities"));
        console.log("[COUNT] all_cities (server):", countSnap.data().count);
      } catch {}

      onComplete?.(
        `Imported/updated: ${written}. Skipped malformed: ${malformed}.`,
        "success"
      );
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
// Real-time listener (keeps current signature; optional filter)
// Usage:
//   listenToCities(cb)                  -> all docs
//   listenToCities(cb, { onlyPinned: true }) -> pinned only
// ---------------------------------------------------------------
const listenToCities = (callback, opts = {}) => {
  const { onlyPinned = false } = opts;
  const baseRef = collection(db, "all_cities");
  const qRef = onlyPinned ? query(baseRef, where("is_pinned", "==", true)) : baseRef;

  return onSnapshot(qRef, (snap) => {
    const cities = [];
    snap.forEach((d) => {
      const data = d.data();
      cities.push({
        id: d.id,
        label: data.label,
        lat: data.lat,
        lng: data.lng,
        is_pinned: !!data.is_pinned
      });
    });
    callback(cities);
  });
};

export { uploadCitiesFromCsv, togglePinStatus, listenToCities };
