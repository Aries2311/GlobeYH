import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// *******************************************************************
// TANDAAN: Palitan ang mga ito ng tunay na Firebase config mo!
// *******************************************************************
const firebaseConfig = {
    apiKey: "AIzaSyDukrt0fbcvgahbwAxiI-5NFHunsYEXdEQ", // Placeholder
    authDomain: "globeyh-5aabb.firebaseapp.com", // Placeholder
    projectId: "globeyh-5aabb", // Placeholder
    storageBucket: "globeyh-5aabb.firebasestorage.app", // Placeholder
    messagingSenderId: "422300739471", // Placeholder
    appId: "1:422300739471:web:0db5b16ee2017dbf650dfa" // Placeholder
};

// I-initialize ang Firebase at Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Function para tingnan kung may existing na city na sa database.
 * @param {string} cityLabel - Ang pangalan ng siyudad na hahanapin.
 * @returns {Promise<boolean>} True kung mayroon na, False kung wala pa.
 */
const cityExists = async (cityLabel) => {
    // Gumagamit tayo ng 'label' para tingnan kung may duplicate.
    const q = query(collection(db, "all_cities"), where("label", "==", cityLabel));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
};

/**
 * Hahawakan ang pag-upload ng CSV file at i-store ang data sa Firestore.
 * @param {File} file - Ang CSV file object.
 * @param {(message: string, type: 'success' | 'error' | 'info') => void} onComplete - Callback function.
 */
const uploadCitiesFromCsv = async (file, onComplete) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length <= 1) { // 1 for header line
            onComplete("Ang file ay walang laman o header lang.", "error");
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
        
        // Hanapin ang index ng mga kailangang column
        const cityIndex = headers.indexOf('city');
        const latIndex = headers.indexOf('lat');
        const lngIndex = headers.indexOf('lng');

        if (cityIndex === -1 || latIndex === -1 || lngIndex === -1) {
            onComplete("Ang CSV ay dapat may mga column na 'city', 'lat', at 'lng'.", "error");
            return;
        }
        
        let uploadedCount = 0;
        let duplicateCount = 0;

        // I-process ang bawat linya simula sa ika-2 linya (data)
        for (let i = 1; i < lines.length; i++) {
            // Simple CSV parsing na ginagamit ang double-quotes at commas
            const values = lines[i].match(/(?:"[^"]*"|[^,]+)/g).map(v => v.trim().replace(/^"|"$/g, ''));

            if (values.length <= Math.max(cityIndex, latIndex, lngIndex)) {
                console.warn(`Skipping malformed line: ${lines[i]}`);
                continue;
            }

            const cityLabel = `${values[cityIndex]}, ${values[cityIndex + 3]}`; //city + country
            const lat = parseFloat(values[latIndex]);
            const lng = parseFloat(values[lngIndex]);

            if (isNaN(lat) || isNaN(lng) || !cityLabel) {
                // Skip invalid data
                continue;
            }

            // **********************************************
            // TINGNAN KUNG MAY DUPLICATE BAGO MAG-UPLOAD
            // **********************************************
            if (await cityExists(cityLabel)) {
                duplicateCount++;
                continue;
            }

            const cityData = {
                label: cityLabel,
                lat: lat,
                lng: lng,
                is_pinned: false // Default status
            };

            try {
                // I-upload sa "all_cities" collection
                await addDoc(collection(db, "all_cities"), cityData);
                uploadedCount++;
            } catch (error) {
                console.error(`Error adding city ${cityLabel}:`, error);
                // Ipagpatuloy sa susunod na city kahit may nag-fail
            }
        }

        let message = `Matagumpay na na-upload ang ${uploadedCount} na mga siyudad.`;
        if (duplicateCount > 0) {
            message += ` ${duplicateCount} na siyudad ang hindi in-upload dahil existing na.`;
        }
        onComplete(message, "success");
    };
    // Simulan ang pagbasa ng file
    reader.readAsText(file);
};

/**
 * Nag-a-update ng is_pinned status ng isang lokasyon.
 * @param {string} docId - Document ID ng lokasyon sa Firestore.
 * @param {boolean} currentStatus - Kasalukuyang status (true/false).
 */
const togglePinStatus = async (docId, currentStatus) => {
    const docRef = doc(db, "all_cities", docId);
    await updateDoc(docRef, {
        is_pinned: !currentStatus // Baliktarin ang status
    });
};

/**
 * Nagse-set up ng real-time listener para sa cities collection.
 * @param {(cities: Array<Object>) => void} callback - Function na tatawagin tuwing may pagbabago sa data.
 * @returns {() => void} Function para i-unsubscribe ang listener.
 */
const listenToCities = (callback) => {
    const citiesRef = collection(db, "all_cities");
    
    // onSnapshot para sa real-time updates
    return onSnapshot(citiesRef, (querySnapshot) => {
        const cities = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            cities.push({ 
                id: doc.id, // Id ng document
                label: data.label, 
                lat: data.lat, 
                lng: data.lng, 
                is_pinned: data.is_pinned || false // Default sa false kung undefined
            });
        });
        // I-call ang callback function sa na-update na data
        callback(cities);
    });
};

export { uploadCitiesFromCsv, togglePinStatus, listenToCities };