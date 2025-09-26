import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Your web app's Firebase configuration from the console
const firebaseConfig = {
    apiKey: "AIzaSyDukrt0fbcvgahbwAxiI-5NFHunsYEXdEQ",
    authDomain: "globeyh-5aabb.firebaseapp.com",
    projectId: "globeyh-5aabb",
    storageBucket: "globeyh-5aabb.firebasestorage.app",
    messagingSenderId: "422300739471",
    appId: "1:422300739471:web:0db5b16ee2017dbf650dfa"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to initialize the database with your static data
async function initializeDatabaseWithData() {
    const locations = [
        {
            "lat": 14.5995,
            "lng": 120.9842,
            "label": "Manila Office - Main Hub",
            "value": 1.0,
            "color": "red",
            "iconUrl": "./assets/my-logo.png"
        },
        {
            "lat": 36.5167,
            "lng": -4.8833,
            "label": "Marbella, Spain - Key Partner",
            "value": 0.9,
            "color": "blue",
            "iconUrl": "./assets/my-logo.png"
        }
    ];

    const collectionRef = collection(db, "pinned_locations");
    const snapshot = await getDocs(collectionRef);

    // Only add data if the collection is empty to avoid duplicates
    if (snapshot.empty) {
        console.log("Database is empty. Populating with initial data...");
        for (const loc of locations) {
            await setDoc(doc(collectionRef), loc);
        }
        console.log("Database populated successfully!");
    } else {
        console.log("Database is already populated. Skipping initial data creation.");
    }
}

// Export the database instance and the initialization function
export { db, initializeDatabaseWithData };