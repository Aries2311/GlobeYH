// File: main.js (FINAL VERSION: HD Globe, Large Logo, at Custom Labels)

// 1. I-configure ang mga constants at i-set up ang container
const globeContainer = document.getElementById('globeViz');
const DATA_URL = './data/my-locations.json'; 

// 2. I-initialize ang Globe
const world = Globe()
    (globeContainer)
    // 🌍 HIGH DEFINITION (HD) DAYTIME TEXTURES
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-day.jpg') 
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png') // HD for better mountain detail
    
    .showGraticules(true)
    .showAtmosphere(true)
    .backgroundColor('#000011'); 
    
// 3. I-set ang auto-rotation
world.controls().autoRotate = true;
world.controls().autoRotateSpeed = 0.5;


// 4. I-fetch at I-visualize ang Data gamit ang HTML Elements (Logo + Text)
fetch(DATA_URL)
    .then(res => {
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        world.htmlElementsData(data)
            .htmlElement(d => {
                // Gumawa ng container para sa logo at text
                const markerDiv = document.createElement('div');
                markerDiv.style.display = 'flex';
                markerDiv.style.flexDirection = 'column'; // Vertical stacking (top-to-bottom)
                markerDiv.style.alignItems = 'center'; // Center horizontally
                markerDiv.style.pointerEvents = 'auto';

                // I-create ang LOGO (Image element)
                const img = document.createElement('img');
                img.src = d.iconUrl; 
                img.style.width = '70px';     // Mas Malaking Logo (70px)
                img.style.height = '70px';    // Mas Malaking Logo (70px)
                img.style.borderRadius = '50%';
                img.style.cursor = 'pointer';
                img.onclick = () => alert(`Location: ${d.label}`);
                img.title = d.label; 

                // I-create ang TEXT LABEL (City Name)
                const label = document.createElement('span');
                // Kunin lang ang city name bago ang ' - '
                label.textContent = d.label.split(' - ')[0]; 
                label.style.marginTop = '2px'; // PINALITAN: Mas masikip na spacing sa ilalim ng logo
                label.style.color = 'yellow'; 
                label.style.fontSize = '14px'; 
                label.style.fontWeight = 'bold';
                label.style.textAlign = 'center';
                label.style.textShadow = '0 0 5px black'; 

                // I-append ang elements sa container
                markerDiv.appendChild(img);
                markerDiv.appendChild(label);

                return markerDiv;
            })
            .lat(d => d.lat)
            .lng(d => d.lng)
            .altitude(0.001); 

        console.log("Globe fully configured with HD textures, large logos, and city labels.");
    })
    .catch(error => {
        console.error("Critical Error: File loading/processing failed.", error);
    });