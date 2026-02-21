// Generate random fog clouds with random positions and sizes
function generateRandomFogClouds() {
  const numClouds = 10;
  let backgroundString = '';
  
  // Create a grid to distribute clouds evenly
  const positions = [];
  const cols = 3;
  const rows = 4;
  
  // Create grid positions with some randomness
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (positions.length < numClouds) {
        // Base position in grid cell
        const cellWidth = 100 / cols;
        const cellHeight = 100 / rows;
        
        // Random offset within the cell to avoid perfect grid
        const randomX = (col * cellWidth) + Math.random() * (cellWidth * 0.8);
        const randomY = (row * cellHeight) + Math.random() * (cellHeight * 0.8);
        
        positions.push({ x: randomX, y: randomY });
      }
    }
  }
  
  // Shuffle positions for more random appearance
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  
  // Size categories: small, medium-small, and medium
  const sizes = [220, 270, 350]; // radius in pixels
  
  // Generate gradients with distributed positions
  for (let i = 0; i < numClouds; i++) {
    // Random distribution: 50% small, 30% medium-small, 20% medium
    const rand = Math.random();
    let sizeIndex;
    if (rand < 0.5) {
      sizeIndex = 0; // small
    } else if (rand < 0.8) {
      sizeIndex = 1; // medium-small
    } else {
      sizeIndex = 2; // medium
    }
    const cloudSize = sizes[sizeIndex];
    
    const randomOpacity = Math.random() * 0.15 + 0.2; // 0.2-0.35 opacity
    const randomGray = Math.random() * 40 + 80; // Gray values between 80-120
    
    const pos = positions[i];
    
    backgroundString += `radial-gradient(circle ${cloudSize}px at ${pos.x}% ${pos.y}%, rgba(${randomGray},${randomGray},${randomGray},${randomOpacity}) 0%, transparent 70%)`;
    
    if (i < numClouds - 1) {
      backgroundString += ',';
    }
  }
  
  // Add the base gradient at the end
  backgroundString += ',linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)';
  
  document.documentElement.style.background = backgroundString;
  document.documentElement.style.backgroundSize = '200% 200%';
  document.documentElement.style.backgroundPosition = 'var(--bg-x, 0%) var(--bg-y, 0%)';
  document.documentElement.style.transition = 'background-position 7s ease-in-out';
  document.documentElement.style.height = '100%';
  document.documentElement.style.width = '100%';
}

// Move fog position smoothly
function randomizeFogPosition() {
  const randomX = Math.random() * 100;
  const randomY = Math.random() * 100;
  
  document.documentElement.style.setProperty('--bg-x', randomX + '%');
  document.documentElement.style.setProperty('--bg-y', randomY + '%');
}

// Generate random clouds on page load
generateRandomFogClouds();

// Update fog position every 10 seconds with random values
setInterval(randomizeFogPosition, 10000);

// Set initial random position
randomizeFogPosition();
