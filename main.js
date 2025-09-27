import { uploadCitiesFromCsv, togglePinStatus, listenToCities } from "./firebase.js";

// Global variables para sa data at UI state
let allCities = []; // Dito i-store ang lahat ng cities mula sa Firestore
let searchTimeout; // Para sa debouncing ng search input

// Default SVG pin icon (dilaw na dot) para sa UNPINNED
const defaultPinUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#FFC300" stroke="white" stroke-width="10"/></svg>';
// Custom Image URL para sa NAKA-PIN na lokasyon. ITO ANG UPDATED PATH
const customImageUrl = './assets/my-logo.png'; 

// UI elements
const globeContainer = document.getElementById('globeViz');
// Bootstrap Modals
const uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
const pinningModal = new bootstrap.Modal(document.getElementById('pinningModal'));
// Input/Buttons/Status
const searchInput = document.getElementById('search-input');
const searchResultsList = document.getElementById('search-results');
const pinningModalText = document.getElementById('pinningModalText');
const togglePinBtn = document.getElementById('togglePinBtn');
const uploadBtn = document.getElementById('uploadBtn');
const loadingSpinner = document.getElementById('loading-spinner');
const statusMessage = document.getElementById('statusMessage');
const csvFile = document.getElementById('csvFile');


// 1. I-initialize ang Globe
const world = Globe()(globeContainer)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .showGraticules(true)
    .showAtmosphere(true)
    .backgroundColor('#000011');
    
// 2. I-set ang auto-rotation
world.controls().autoRotate = false;
world.controls().autoRotateSpeed = 0.0


// *******************************************************************
// 3. GLOBE MARKER RENDERING FUNCTION
// *******************************************************************

/**
 * Nagre-render ng custom HTML marker para sa globe.
 * @param {Object} data - City data mula sa Firestore (Naka-filter na sa is_pinned=true).
 */
function renderGlobeMarkers(data) {
    world.htmlElementsData(data)
        .htmlElement(d => {
            // Gumawa ng container para sa logo at label
            const markerDiv = document.createElement('div');
            markerDiv.className = 'marker-container';

            // Pumili ng icon/image URL batay sa 'is_pinned' status
            // Dahil naka-filter na ang data, lahat ng nasa listahan ay naka-pin na.
            const iconUrl = d.is_pinned ? customImageUrl : defaultPinUrl;
            
            // I-create ang ICON (Image)
            const img = document.createElement('img');
            img.className = 'marker-icon';
            img.src = iconUrl; 
            
            // On Click Event: Mag-zoom in at magpakita ng Pinning Modal
            img.onclick = (event) => {
                event.stopPropagation();

                
                // Ipakita ang Pinning Modal
                const status = d.is_pinned ? 'Yes' : 'No';
                pinningModalText.textContent = `Nais mo bang i-toggle ang pin status para sa ${d.label}? Kasalukuyang status: ${status}.`;
                togglePinBtn.dataset.docId = d.id;
                togglePinBtn.dataset.currentStatus = d.is_pinned;
                pinningModal.show();
            };
            
            // I-create ang TEXT LABEL (City Name)
            const label = document.createElement('span');
            label.className = 'marker-label';
            // Kunin lang ang city name bago ang ','
            label.textContent = d.label.split(',')[0]; 

            // I-append ang elements sa container
            markerDiv.appendChild(img);
            markerDiv.appendChild(label);

            return markerDiv;
        })
        .lat(d => d.lat)
        .lng(d => d.lng)
        .altitude(0.005);
}


// *******************************************************************
// 4. EVENT LISTENERS AT APP INITIALIZATION
// *******************************************************************

// Handle CSV Upload sa modal
uploadBtn.addEventListener('click', async () => {
    const file = csvFile.files[0];
    if (!file) {
        statusMessage.className = 'mt-3 text-danger';
        statusMessage.textContent = 'Pumili muna ng CSV file.';
        return;
    }

    // Simulan ang loading state
    uploadBtn.disabled = true;
    loadingSpinner.style.display = 'inline-block';
    statusMessage.className = 'mt-3 text-info';
    statusMessage.textContent = 'Ina-upload at ini-store sa database...';

    // Call ang upload function mula sa firebase.js
    await uploadCitiesFromCsv(file, (message, type) => {
        // Tapusin ang loading state
        uploadBtn.disabled = false;
        loadingSpinner.style.display = 'none';

        Swal.fire({
            icon: type,
            title: type === 'success' ? 'Tagumpay!' : 'May Problema',
            text: message,
        });

        // Isara ang modal kung successful
        if (type === 'success') {
            uploadModal.hide();
            csvFile.value = '';
        }
    });
});

// Handle Toggle Pin Button sa pinning modal
togglePinBtn.addEventListener('click', async () => {
    const docId = togglePinBtn.dataset.docId;
    const currentStatus = togglePinBtn.dataset.currentStatus === 'true';

    if (docId) {
        pinningModal.hide();
        await togglePinStatus(docId, currentStatus);
    }
});

// Real-time Data Listener Setup
window.onload = () => {
    try {
        // Tinitiyak nito na tuwing may magbabago sa 'is_pinned' status sa Firestore, 
        // magre-refresh ang globe at ipapakita lang ang mga naka-pin.
        listenToCities((cities) => {
            console.log(`May ${cities.length} na lokasyon na-load mula sa Firestore.`);
            allCities = cities;
            
            // ITO ANG SIGURADUHIN: NAKA-FILTER TAYO SA is_pinned = true LAMANG
            const pinnedCities = allCities.filter(city => city.is_pinned);
            renderGlobeMarkers(pinnedCities);
        });
    } catch (error) {
        console.error("Error setting up Firestore listener:", error);
    }
};


// *******************************************************************
// 5. SEARCH FUNCTIONALITY
// *******************************************************************

// Debounced search input handler
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchResultsList.style.display = 'none';
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') {
        return;
    }

    searchTimeout = setTimeout(() => {
        try {
            // I-filter mula sa allCities array
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
            
                   
                    
                    searchResultsList.style.display = 'none';
                    searchInput.value = '';
                    
                    // Ipakita ang pin modal (Dito magsisimula ang manual pinning)
                    const status = city.is_pinned ? 'Yes' : 'No';
                    pinningModalText.textContent = `Nais mo bang i-toggle ang pin status para sa ${city.label}? Kasalukuyang status: ${status}.`;
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