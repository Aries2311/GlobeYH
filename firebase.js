import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDukrt0fbcvgahbwAxiI-5NFHunsYEXdEQ",
    authDomain: "globeyh-5aabb.firebaseapp.com",
    projectId: "globeyh-5aabb",
    storageBucket: "globeyh-5aabb.firebasestorage.app",
    messagingSenderId: "422300739471",
    appId: "1:422300739471:web:0db5b16ee2017dbf650dfa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// New function to check for existing city
const cityExists = async (cityLabel) => {
    const q = query(collection(db, "all_cities"), where("label", "==", cityLabel));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
};

const uploadCitiesFromCsv = async (file, onComplete) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            onComplete("The file is empty.", "error");
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const cityIndex = headers.indexOf('city');
        const countryIndex = headers.indexOf('country');
        const latIndex = headers.indexOf('lat');
        const lngIndex = headers.indexOf('lng');

        if (cityIndex === -1 || countryIndex === -1 || latIndex === -1 || lngIndex === -1) {
            onComplete("CSV must have 'city', 'country', 'lat', and 'lng' columns.", "error");
            return;
        }

        let uploadedCount = 0;
        let duplicateCount = 0;
        
        for (const line of lines.slice(1)) {
            const values = line.split(',');
            const cityLabel = `${values[cityIndex].replace(/"/g, '')}, ${values[countryIndex].replace(/"/g, '')}`;
            
            // Check for duplicates before uploading
            const exists = await cityExists(cityLabel);
            if (exists) {
                duplicateCount++;
                continue; // Skip this city
            }

            const lat = parseFloat(values[latIndex].replace(/"/g, ''));
            const lng = parseFloat(values[lngIndex].replace(/"/g, ''));
            
            if (isNaN(lat) || isNaN(lng)) {
                // Skip invalid data
                continue;
            }

            const cityData = {
                label: cityLabel,
                lat: lat,
                lng: lng,
                is_pinned: false
            };

            try {
                await addDoc(collection(db, "all_cities"), cityData);
                uploadedCount++;
            } catch (error) {
                console.error(`Error adding city ${cityLabel}:`, error);
                // Continue to the next city even if one fails
            }
        }

        let message = `Successfully uploaded ${uploadedCount} cities.`;
        if (duplicateCount > 0) {
            message += ` ${duplicateCount} cities were skipped because they already exist.`;
        }
        onComplete(message, "success");
    };
    reader.readAsText(file);
};

const togglePinStatus = async (docId, currentStatus) => {
    const docRef = doc(db, "all_cities", docId);
    await updateDoc(docRef, {
        is_pinned: !currentStatus
    });
};

const listenToCities = (callback) => {
    const citiesRef = collection(db, "all_cities");
    return onSnapshot(citiesRef, (querySnapshot) => {
        const cities = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            cities.push({ id: doc.id, ...data });
        });
        callback(cities);
    });
};

export { db, uploadCitiesFromCsv, togglePinStatus, listenToCities };