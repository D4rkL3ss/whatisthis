import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
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
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    // Block access to .map files just in case
    if (filePath.endsWith('.map')) {
      res.status(403).end();
    }
  }
}));

// Security headers for all responses
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Store codes securely (in production, use a database)
const validCodes = {
  'THE FIRST FRAGMENT': { shardNumber: 1, fragmentComponent: 'FirstFragment' },
  "HE'S ALWAYS WATCHING": { shardNumber: 2, fragmentComponent: 'SecondFragment' },
  "HAPPY FAMILY": { shardNumber: 3, fragmentComponent: 'ThirdFragment' },
  "SHADOWS FROM THE PAST": { shardNumber: 4, fragmentComponent: 'FourthFragment' }
};

// Token store: token -> { fragment, createdAt }
const tokenStore = new Map();
const TOKEN_TTL = 60 * 60 * 1000; // 1 hour
const UNLOCK_SECRET = process.env.UNLOCK_SECRET || crypto.randomBytes(64).toString('hex');

function generateToken(fragment) {
  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, { fragment, createdAt: Date.now() });
  return token;
}

function verifyToken(token, fragment) {
  const entry = tokenStore.get(token);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TOKEN_TTL) {
    tokenStore.delete(token);
    return false;
  }
  return entry.fragment === fragment;
}

// Create an HMAC-signed unlock proof for a fragment
function createUnlockProof(fragment) {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', UNLOCK_SECRET)
    .update(fragment + ':' + timestamp)
    .digest('hex');
  return fragment + ':' + timestamp + ':' + hmac;
}

// Verify an unlock proof is authentic
function verifyUnlockProof(proof, expectedFragment) {
  if (!proof || typeof proof !== 'string') return false;
  const parts = proof.split(':');
  if (parts.length !== 3) return false;
  const [fragment, timestamp, hmac] = parts;
  if (fragment !== expectedFragment) return false;
  const expectedHmac = crypto.createHmac('sha256', UNLOCK_SECRET)
    .update(fragment + ':' + timestamp)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
}

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokenStore) {
    if (now - entry.createdAt > TOKEN_TTL) tokenStore.delete(token);
  }
}, 10 * 60 * 1000);

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
    const token = generateToken(codeData.fragmentComponent);
    const unlockProof = createUnlockProof(codeData.fragmentComponent);
    return res.json({ 
      valid: true, 
      shardNumber: codeData.shardNumber,
      fragment: codeData.fragmentComponent,
      token,
      unlockProof
    });
  }

  // Don't reveal which code is correct (security)
  res.json({ valid: false });
});

// Verify a token for a specific fragment
app.post('/api/verify-token', (req, res) => {
  const { token, fragment } = req.body;

  if (!token || !fragment || typeof token !== 'string' || typeof fragment !== 'string') {
    return res.status(400).json({ valid: false });
  }

  if (verifyToken(token, fragment)) {
    return res.json({ valid: true });
  }

  res.json({ valid: false });
});

// Issue a fresh token for an already-unlocked fragment (checkpoint navigation)
app.post('/api/reissue-token', (req, res) => {
  const { fragment, unlockProof } = req.body;

  if (!fragment || typeof fragment !== 'string') {
    return res.status(400).json({ valid: false });
  }

  // Only issue tokens for known fragment names
  const knownFragments = Object.values(validCodes).map(c => c.fragmentComponent);
  if (!knownFragments.includes(fragment)) {
    return res.json({ valid: false });
  }

  // Verify the unlock proof is authentic
  if (!verifyUnlockProof(unlockProof, fragment)) {
    return res.json({ valid: false });
  }

  const token = generateToken(fragment);
  return res.json({ valid: true, token });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
