// Random fog cloud animation
function randomizeFogPosition() {
  const randomX = Math.random() * 100;
  const randomY = Math.random() * 100;
  
  document.documentElement.style.setProperty('--bg-x', randomX + '%');
  document.documentElement.style.setProperty('--bg-y', randomY + '%');
}

// Update fog position every 4 seconds with random values
setInterval(randomizeFogPosition, 4000);

// Set initial random position
randomizeFogPosition();
