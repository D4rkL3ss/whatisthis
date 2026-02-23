import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// ── Active Users (SSE) ──
let activeClients = new Set();

function broadcastActiveUsers() {
  const count = activeClients.size;
  for (const res of activeClients) {
    res.write(`data: ${JSON.stringify({ count })}\n\n`);
  }
}

app.get('/api/active-users', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  activeClients.add(res);
  broadcastActiveUsers();

  req.on('close', () => {
    activeClients.delete(res);
    broadcastActiveUsers();
  });
});

// Serve static files from the Vite dist folder
app.use(express.static(path.join(__dirname, 'dist')));

// Store codes securely (in production, use a database)
const validCodes = {
  'THE FIRST FRAGMENT': { shardNumber: 1, fragmentComponent: 'FirstFragment' },
  "HE'S ALWAYS WATCHING": { shardNumber: 2, fragmentComponent: 'SecondFragment' },
  "HAPPY FAMILY": { shardNumber: 3, fragmentComponent: 'ThirdFragment' },
  "SHADOWS FROM THE PAST": { shardNumber: 4, fragmentComponent: 'FourthFragment' }
};

// Rate limiting - simple implementation
const rateLimitMap = new Map();

const isRateLimited = (ip) => {
  const now = Date.now();
  const limit = rateLimitMap.get(ip) || [];
  
  // Keep only requests from last minute
  const recentRequests = limit.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 10) {
    return true;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return false;
};

// Get current UTC time from server
app.get('/api/get-time', async (req, res) => {
  const now = new Date();
  res.json({ 
    timestamp: now.getTime(),
    iso: now.toISOString()
  });
});

app.post('/api/validate-code', (req, res) => {
  const clientIp = req.ip;
  
  // Rate limiting check
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ 
      valid: false, 
      error: 'Too many requests. Try again later.' 
    });
  }

  const { code } = req.body;

  // Validate input
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ 
      valid: false, 
      error: 'Invalid input' 
    });
  }

  const trimmedCode = code.trim();
  const codeData = validCodes[trimmedCode];

  if (codeData) {
    return res.json({ 
      valid: true, 
      shardNumber: codeData.shardNumber,
      fragment: codeData.fragmentComponent
    });
  }

  // Don't reveal which code is correct (security)
  res.json({ valid: false });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
