import { db, initializeDatabaseWithData } from "./firebase.js";
import { collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// File: main.js (UPDATED: Firestore Integration with Add Form)

// 1. Configure constants and set up the container
const globeContainer = document.getElementById('globeViz');

// 2. Initialize the Globe
const world = Globe()
    (globeContainer)
    // 🌍 HIGH DEFINITION (HD) DAYTIME TEXTURES
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png') // HD for better mountain detail

    .showGraticules(true)
    .showAtmosphere(true)
    .backgroundColor('#000011');

// 3. Set auto-rotation (REMOVED)
// world.controls().autoRotate = true;
// world.controls().autoRotateSpeed = 0.5;

// Function to refresh globe data
const refreshGlobeData = async () => {
    try {
        const locationsRef = collection(db, "pinned_locations");
        const querySnapshot = await getDocs(locationsRef);
        const data = [];
        querySnapshot.forEach((doc) => {
            data.push(doc.data());
        });

        world.htmlElementsData(data)
            .htmlElement(d => {
                const markerDiv = document.createElement('div');
                markerDiv.style.display = 'flex';
                markerDiv.style.flexDirection = 'column';
                markerDiv.style.alignItems = 'center';
                markerDiv.style.pointerEvents = 'auto';

                const img = document.createElement('img');
                img.src = d.iconUrl;
                img.style.width = '70px';
                img.style.height = '70px';
                img.style.borderRadius = '50%';
                img.style.cursor = 'pointer';
                img.onclick = () => Swal.fire({
                    title: d.label,
                    html: `Latitude: <strong>${d.lat.toFixed(4)}</strong><br>Longitude: <strong>${d.lng.toFixed(4)}</strong>`,
                    icon: 'info'
                });
                img.title = d.label;

                const label = document.createElement('span');
                label.textContent = d.label.split(' - ')[0];
                label.style.marginTop = '2px';
                label.style.color = 'yellow';
                label.style.fontSize = '14px';
                label.style.fontWeight = 'bold';
                label.style.textAlign = 'center';
                label.style.textShadow = '0 0 5px black';

                markerDiv.appendChild(img);
                markerDiv.appendChild(label);

                return markerDiv;
            })
            .lat(d => d.lat)
            .lng(d => d.lng)
            .altitude(0.001);

        console.log("Data loaded from Firestore successfully!");
    } catch (error) {
        console.error("Error fetching data from Firestore:", error);
    }
};

// 4. Handle Modal and Form Logic
const addLocationModal = new bootstrap.Modal(document.getElementById('addLocationModal'));
const addLocationForm = document.getElementById('addLocationForm');

// Open modal on globe click and populate lat/lng
world.onGlobeClick(({ lat, lng }) => {
    // Globe rotation is now handled manually. Just open the form.
    document.getElementById('latInput').value = lat;
    document.getElementById('lngInput').value = lng;
    addLocationModal.show();
});

// Save location on form submit
addLocationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('locationName').value;
    const lat = parseFloat(document.getElementById('latInput').value);
    const lng = parseFloat(document.getElementById('lngInput').value);
    const iconUrl = document.getElementById('iconUrlInput').value;

    const newLocation = {
        label: name,
        lat: lat,
        lng: lng,
        value: 1.0,
        color: "white",
        iconUrl: iconUrl
    };

    try {
        const locationsRef = collection(db, "pinned_locations");
        await addDoc(locationsRef, newLocation);

        Swal.fire({
            icon: 'success',
            title: 'Naisave!',
            text: 'Matagumpay na naidagdag ang bagong lokasyon.',
            confirmButtonText: 'OK'
        });

        // Close modal and refresh the globe
        addLocationModal.hide();
        addLocationForm.reset();
        await refreshGlobeData();

    } catch (error) {
        console.error("Error adding document: ", error);
        Swal.fire({
            icon: 'error',
            title: 'May Error!',
            text: 'Hindi naisave ang lokasyon. Subukang muli.',
            confirmButtonText: 'OK'
        });
    }
});

// 5. Initialize the database and load data
initializeDatabaseWithData().then(() => {
    refreshGlobeData();
});