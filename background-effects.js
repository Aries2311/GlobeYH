// background-effects.js

/**
 * Nagdaragdag ng Three.js stars sa background.
 * @param {object} world - Ang instance ng Globe object (na naglalaman ng Three.js scene).
 */
export function addStars(world) {
  if (!world || !world.scene || typeof THREE === 'undefined') {
    console.warn("Globe object or THREE not available for star field.");
    return;
  }

  const starCount = 5000;
  const starGeo = new THREE.BufferGeometry();
  const positions = [];

  for (let i = 0; i < starCount; i++) {
    const radius = 2000;
    const x = (Math.random() - 0.5) * radius * 2;
    const y = (Math.random() - 0.5) * radius * 2;
    const z = (Math.random() - 0.5) * radius * 2;

    if (Math.sqrt(x*x + y*y + z*z) > radius / 4) {
        positions.push(x, y, z);
    }
  }

  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const starMaterial = new THREE.PointsMaterial({
    color: 0xeeeeee,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.8
  });

  const stars = new THREE.Points(starGeo, starMaterial);
  world.scene().add(stars);

  console.log("Added star field to the background.");
}


// Simple simulated 'comet' trail
export function setupComets() {
    const COMET_COUNT = 3;
    const container = document.body;

    // A Comet class (para madaling i-manage)
    class Comet {
        constructor(id) {
            this.element = document.createElement('div');
            this.element.id = `comet-${id}`;
            this.element.className = 'comet';
            container.appendChild(this.element);
            this.reset();
        }

        reset() {
            const startX = Math.random() < 0.5 ? -50 : window.innerWidth + 50;
            const startY = Math.random() * window.innerHeight;
            const endX = startX < 0 ? window.innerWidth + 50 : -50;
            const endY = Math.random() * window.innerHeight;
            const duration = Math.random() * 8 + 4; // 4 to 12 seconds
            const delay = Math.random() * 10; // 0 to 10 seconds

            this.element.style.setProperty('--start-x', `${startX}px`);
            this.element.style.setProperty('--start-y', `${startY}px`);
            this.element.style.setProperty('--end-x', `${endX}px`);
            this.element.style.setProperty('--end-y', `${endY}px`);
            this.element.style.animationDuration = `${duration}s`;
            this.element.style.animationDelay = `${delay}s`;

            this.element.style.animationName = 'none';
            this.element.offsetHeight; // Force a reflow
            this.element.style.animationName = 'comet-fly';
        }
    }

    const comets = [];
    for (let i = 0; i < COMET_COUNT; i++) {
        comets.push(new Comet(i));
    }

    container.addEventListener('animationend', (event) => {
        if (event.target.classList.contains('comet')) {
            const id = event.target.id.split('-')[1];
            comets[id].reset();
        }
    });

    console.log(`Setup ${COMET_COUNT} comet trails.`);
}