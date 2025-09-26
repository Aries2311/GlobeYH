import { uploadCitiesFromCsv, togglePinStatus, listenToCities } from "./firebase.js";

// Global variables
let allCities = [];
const defaultPinUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="yellow" stroke="white" stroke-width="10"/></svg>';
const customImageUrl = './assets/my-logo.png'; 

// UI elements
const globeContainer = document.getElementById('globeViz');
const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
const pinningModal = new bootstrap.Modal(document.getElementById('pinningModal'));
const searchInput = document.getElementById('search-input');
const searchResultsList = document.getElementById('search-results');
const pinningModalText = document.getElementById('pinningModalText');
const togglePinBtn = document.getElementById('togglePinBtn');
const uploadBtn = document.getElementById('uploadBtn');
const loadingSpinner = document.getElementById('loading-spinner');
const statusMessage = document.getElementById('statusMessage');

// Initialize the Globe
const world = Globe()(globeContainer)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .showGraticules(true)
    .showAtmosphere(true)
    .backgroundColor('#000011');

// Handle CSV Upload
uploadBtn.addEventListener('click', () => {
    const file = document.getElementById('csvFile').files[0];
    if (!file) {
        statusMessage.textContent = "Paki-pili muna ang file.";
        return;
    }
    
    // Set loading state
    uploadBtn.disabled = true;
    loadingSpinner.classList.remove('d-none');
    statusMessage.textContent = "Ina-upload at iniimbak ang file...";

    uploadCitiesFromCsv(file, (message, type) => {
        statusMessage.textContent = message;
        statusMessage.style.color = type === 'success' ? 'green' : 'red';
        
        // Reset loading state
        uploadBtn.disabled = false;
        loadingSpinner.classList.add('d-none');
        if (type === 'success') {
            document.getElementById('csvFile').value = '';
        }
    });
});

// Real-time listener from Firebase
listenToCities((cities) => {
    allCities = cities.filter(city => city.lat && city.lng);
    renderGlobePins(allCities);
});

// Function to render pins based on is_pinned status (FIXED & UPDATED)
function renderGlobePins(cities) {
    try {
        const pins = cities.filter(city => city.lat && city.lng);
        
        // Ito ang FIXED na code: Pagsamahin sa iisang chain
        world.htmlElementsData(pins)
            .htmlElement(d => {
                const markerDiv = document.createElement('div');
                markerDiv.style.display = 'flex';
                markerDiv.style.flexDirection = 'column';
                markerDiv.style.alignItems = 'center';
                markerDiv.style.cursor = 'pointer';

                const icon = document.createElement('img');
                // Use customImageUrl for pinned cities, defaultPinUrl for unpinned
                icon.src = d.is_pinned ? customImageUrl : defaultPinUrl;
                icon.style.width = d.is_pinned ? '70px' : '20px';
                icon.style.height = d.is_pinned ? '70px' : '20px';
                icon.style.borderRadius = d.is_pinned ? '50%' : '50%';
                icon.title = d.label;

                icon.onclick = () => {
                    const status = d.is_pinned ? 'Yes' : 'No';
                    pinningModalText.textContent = `Do you want to toggle the pin status for ${d.label}? Current status: ${status}.`;
                    togglePinBtn.dataset.docId = d.id;
                    togglePinBtn.dataset.currentStatus = d.is_pinned;
                    pinningModal.show();
                };

                markerDiv.appendChild(icon);

                // --- NEW: Add city name label if it is pinned ---
                if (d.is_pinned) {
                    const label = document.createElement('span');
                    const cityName = d.label.split(',')[0].trim();
                    label.textContent = cityName; 
                    
                    // Styling for the label
                    label.style.marginTop = '2px';
                    label.style.color = 'white';
                    label.style.fontSize = '12px'; 
                    label.style.fontWeight = 'bold';
                    label.style.textAlign = 'center';
                    label.style.textShadow = '0 0 5px black, 0 0 5px black'; 

                    markerDiv.appendChild(label);
                }
                // --------------------------------------------------

                return markerDiv;
            })
            .lat(d => d.lat)
            .lng(d => d.lng)
            .altitude(0.01);

    } catch (error) {
        console.error("Error in renderGlobePins:", error);
    }
}

// Handle pinning modal button click
togglePinBtn.addEventListener('click', async () => {
    try {
        const docId = togglePinBtn.dataset.docId;
        const currentStatus = togglePinBtn.dataset.currentStatus === 'true';

        await togglePinStatus(docId, currentStatus);
        pinningModal.hide();
    } catch (error) {
        console.error("Error toggling pin status:", error);
    }
});

// Search functionality
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchResultsList.style.display = 'none';
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') {
        return;
    }

    searchTimeout = setTimeout(() => {
        try {
            const results = allCities.filter(city => city.label.toLowerCase().includes(query));
            displaySearchResults(results);
        } catch (error) {
            console.error("Error during search:", error);
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
                    
                    const status = city.is_pinned ? 'Yes' : 'No';
                    pinningModalText.textContent = `Do you want to toggle the pin status for ${city.label}? Current status: ${status}.`;
                    togglePinBtn.dataset.docId = city.id;
                    togglePinBtn.dataset.currentStatus = city.is_pinned;
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
