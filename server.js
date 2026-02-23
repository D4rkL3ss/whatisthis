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

// ── Scraper / Bot blocking ──
const BLOCKED_UA_PATTERNS = [
  /wget/i, /curl/i, /httrack/i, /scrapy/i, /python-requests/i,
  /httpie/i, /libwww/i, /lwp-trivial/i, /teleport/i, /fetch/i,
  /aiohttp/i, /go-http-client/i, /java\//i, /apache-httpclient/i,
  /node-fetch/i, /axios/i, /got\//i, /undici/i,
];

app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';

  // Block requests with no user-agent (bots/scripts)
  if (!ua) {
    return res.status(403).send('Forbidden');
  }

  // Block known scraper user-agents
  if (BLOCKED_UA_PATTERNS.some(pattern => pattern.test(ua))) {
    return res.status(403).send('Forbidden');
  }

  next();
});

// ── Rate limiting for static assets ──
const staticRateMap = new Map();

function isStaticRateLimited(ip) {
  const now = Date.now();
  const window = 10000; // 10 second window
  const maxRequests = 30; // max 30 static asset requests per 10 seconds

  let timestamps = staticRateMap.get(ip) || [];
  timestamps = timestamps.filter(t => now - t < window);

  if (timestamps.length >= maxRequests) {
    return true;
  }

  timestamps.push(now);
  staticRateMap.set(ip, timestamps);
  return false;
}

// Cleanup static rate limit map every minute
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of staticRateMap) {
    const recent = timestamps.filter(t => now - t < 10000);
    if (recent.length === 0) staticRateMap.delete(ip);
    else staticRateMap.set(ip, recent);
  }
}, 60000);

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

// Serve static files from the Vite dist folder (with rate limiting)
app.use((req, res, next) => {
  // Only rate-limit GET requests for static assets (not API calls)
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    if (isStaticRateLimited(req.ip)) {
      return res.status(429).send('Too many requests');
    }
  }
  next();
});

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

// ── Archive content (server-side only) ──

const ARCHIVES_CONTENT = {
  1: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIO CALL LOG — CASE #0041
DATE: ██/██/████  |  TIME: 17:05
DURATION: 00:04:12
PARTICIPANTS: Detective Mark, Unknown
STATUS: CONNECTION LOST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[17:05] DETECTIVE MARK: Did you find it yet?

[17:06] UNKNOWN: I don't think we should dig any deeper...

[17:06] DETECTIVE MARK: That's not what I asked, I need to know if you found it or not!

[17:06] DETECTIVE MARK: My reputation is on the line here! I NEED you to proceed with this investigation!

[17:06] UNKNOWN: Woah! Don't start with that again! My life is seriously in danger and you're still complaining! 

[17:06] DETECTIVE MARK: Fine! Have it your way, but don't forget I'm not doing this for me, I'm doing this for my daughter.

[17:06] UNKNOWN: *sighs* Sure. I know the details... 

[17:06] UNKNOWN: I'll try to get you the documents of the incident jus-

[17:07] UNKNOWN: Wait, what is that? 

[17:07] DETECTIVE MARK: What are you talking about?

[17:07] UNKNOWN: I don't know, there's just a pair of green eyes looking at me...

[17:07] DETECTIVE MARK: Green eyes?

[17:07] UNKNOWN: What the fuck is that!!?

[17:08] DETECTIVE MARK: Doc? What's happening?

[17:08] UNKNOWN: [UNRECOGNIZABLE NOISES]

[17:09] DETECTIVE MARK: DOC!?

[17:09] ▓▓ SIGNAL LOST — CALL TERMINATED ▓▓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF LOG`,
  2: `Legends whisper of a being that dwells in the most forsaken depths of existence, a place known only as the Abyss. There, shrouded in eternal darkness, it feeds upon the anguish and dread that seep from the world above, growing ever stronger with each trembling heartbeat of mortal despair. Yet, among the countless souls it tormented, there was one who stirred something unfamiliar within the creature, a fragile thread of fascination, perhaps even attachment. Between the realms of shadow and flesh, an unholy bond was born. But affection from such a being is perilous, when the human child defied the path of virtue, the creature's silent watch turned to wrath. The next dawn arrived heavy with unease, for the child was gone, vanished as though erased from reality itself. To this day, parents recount the tale in hushed tones to bind their children's hearts with fear and obedience. Yet some believe the story conceals an older truth, one that lingers still, waiting in the dark beneath our world.`,
  3: `The Braddocks were once a family of stature, refined, respected, and envied. Their manor sat upon the hill like a crown of stone, overseeing the town below. Yet beneath their polished image festered deceit. The youngest of the household, a pale and quiet child, carried the mark of a secret, born from infidelity and despised for it. Within those lavish walls, her laughter withered under whispers, her innocence bruised by those sworn to protect her. It was said that the Braddock's patriarch discovered an archaic manuscript, one recounting the legend of the creature from the Abyss, the devourer of despair. He regarded it as myth, even jested upon it during his fits of drink. But the child, whose tears had become ritual, drew the creature's sympathy. Their kindred agony entwined them, two spirits bound by suffering, one mortal, one eternal. Then came the night of silence. No servant stirred, no light gleamed from the manor's towering windows. When neighbors finally dared to cross the threshold, they found only the echo of emptiness, every Braddock gone, along with the child, and any trace of what transpired. Furniture stood untouched, the fire in the hearth cold but recently fed, a dinner table set for six, untouched. The police descended upon the estate with vigor. They scoured every room, every field and lake, and brought dogs to trace scent or sound. Yet every lead dissolved into nothing, no footprints on the soil, no bodies, no signs of struggle, not even a draft where doors had once been opened. Reports were filed, witnesses interviewed, theories spun like cobwebs in the dark, but none could capture what had truly occurred. In the end, the case was sealed, labeled unsolved. Still, on windless nights, the old inspectors swore they could see lanterns glimmering near the ruin and hear faint laughter carried from deep below, where light cannot reach.`,
  4: `Excerpt from Detective Mark's Personal Journal
June 17th, 1997

Three months have passed since the Braddock case was declared cold. Officially, I am no longer attached to the investigation, but how does one sever ties with their own damnation? They still call it an unsolved disappearance, a tidy phrase for something far uglier, a secret that festers behind every word of that report.

I return to the manor more often than I admit, always after dark. The air there feels wrong, sometimes heavy, listening. The constables mock my persistence, but they don't understand. They never met her. The child. My child.

No one knows the truth of her blood, not even the department. She bore the Braddock name, but the shame she carried was mine alone. I told myself my distance was protection, that my silence would keep her safe. Yet every bruise, every scream that went unheard... I heard them all, if only too late.

The legends I once dismissed now feel closer than reason. The mediums I consulted spoke of eyes within the dark, whispering her name, promising deliverance through vengeance. I had called them mad, and perhaps they are, but if madness is where she dwells, perhaps I, too, must step into it.

Last night, I dreamed of her standing at the edge of a bottomless chasm, pale and still. A shape lingered behind her, vast and formless, its presence almost tender. She looked back once and smiled, not at me, but at the thing beside her. Then they both descended, and the darkness closed like water over them.

I fear the creature has not taken her from me… but to me. The sin that birthed her has come full circle, and in the silence of these nights, I begin to wonder if what vanished in that house was not the Braddocks, nor even the child, but my last fragment of salvation.`,
};

// Serve archive content (requires valid unlock proofs)
app.post('/api/archive-content', (req, res) => {
  const { archiveId, unlockProofs } = req.body;

  if (!archiveId || typeof archiveId !== 'number' || archiveId < 1 || archiveId > 4) {
    return res.status(400).json({ error: 'Invalid archive ID' });
  }

  if (!Array.isArray(unlockProofs)) {
    return res.status(400).json({ error: 'Invalid proofs' });
  }

  // Count how many valid unlock proofs the user has
  let validCount = 0;
  const seen = new Set();
  for (const entry of unlockProofs) {
    if (entry && entry.fragment && entry.proof && !seen.has(entry.fragment)) {
      if (verifyUnlockProof(entry.proof, entry.fragment)) {
        validCount++;
        seen.add(entry.fragment);
      }
    }
  }

  // Archive N requires N valid unlock proofs
  if (validCount < archiveId) {
    return res.status(403).json({ error: 'Insufficient unlocks' });
  }

  const content = ARCHIVES_CONTENT[archiveId];
  if (!content) {
    return res.status(404).json({ error: 'Archive not found' });
  }

  res.json({ content });
});

// ── Protected fragment data endpoints ──

// Reward URL for FourthFragment (token-gated)
const REWARD_URL = process.env.REWARD_URL || 'https://docs.google.com/forms/d/e/1FAIpQLSfQ0DJtSXJoDN2ABTbLk2kKg3QH4w4uyCDeNtzkw0PgM7dowg/viewform?usp=publish-editor';

app.post('/api/fragment-reward', (req, res) => {
  const { token, fragment } = req.body;
  if (!token || !fragment || fragment !== 'FourthFragment') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!verifyToken(token, fragment)) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  res.json({ url: REWARD_URL });
});

// Image schedule for ThirdFragment (server-side only)
const IMAGE_SCHEDULE = [
  { time: [15, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [17, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [19, 30], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [21, 30], file: 'HappyFamily_pt4.png', label: 'Part 4' },
];

app.post('/api/fragment-image', (req, res) => {
  const { token, fragment } = req.body;
  if (!token || !fragment || fragment !== 'ThirdFragment') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!verifyToken(token, fragment)) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  let activeFile = null;
  let activeLabel = 'No image yet';

  for (const entry of IMAGE_SCHEDULE) {
    const entryMinutes = entry.time[0] * 60 + entry.time[1];
    if (currentMinutes >= entryMinutes && currentMinutes <= entryMinutes + 5) {
      activeFile = entry.file;
      activeLabel = entry.label;
    }
  }

  if (!activeFile) {
    return res.json({ available: false, label: activeLabel });
  }

  res.json({ available: true, label: activeLabel, imageUrl: `/api/protected-asset/${activeFile}?token=${token}` });
});

// Serve protected assets (token-gated, supports all fragments)
const PROTECTED_ASSETS = {
  'firstmission.png': 'FirstFragment',
  'monstervideo.mp4': 'SecondFragment',
  'HappyFamily_pt1.png': 'ThirdFragment',
  'HappyFamily_pt2.png': 'ThirdFragment',
  'HappyFamily_pt3.png': 'ThirdFragment',
  'HappyFamily_pt4.png': 'ThirdFragment',
};

app.get('/api/protected-asset/:filename', (req, res) => {
  const { token } = req.query;
  const filename = req.params.filename;
  const requiredFragment = PROTECTED_ASSETS[filename];

  if (!requiredFragment) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!token || !verifyToken(token, requiredFragment)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const assetPath = path.join(__dirname, 'server-assets', filename);
  res.sendFile(assetPath);
});

// Get asset URL for FirstFragment (token-gated)
app.post('/api/fragment-asset', (req, res) => {
  const { token, fragment } = req.body;
  if (!token || !fragment) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!verifyToken(token, fragment)) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const assetMap = {
    FirstFragment: { filename: 'firstmission.png', type: 'image' },
    SecondFragment: { filename: 'monstervideo.mp4', type: 'video' },
  };

  const asset = assetMap[fragment];
  if (!asset) {
    return res.status(404).json({ error: 'No asset for this fragment' });
  }

  res.json({
    assetUrl: `/api/protected-asset/${asset.filename}?token=${token}`,
    type: asset.type,
  });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
