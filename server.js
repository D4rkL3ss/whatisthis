import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
  "SHADOWS FROM THE PAST": { shardNumber: 4, fragmentComponent: 'FourthFragment' },
  "HOPE AND DESPAIR": { shardNumber: 5, fragmentComponent: 'FifthFragment' }
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

// ── Global reset epoch ──
// Bump this to force every client to clear localStorage on next visit.
// Persists only in memory; resets to 0 on redeploy (which is fine — a
// redeploy already changes UNLOCK_SECRET if you rotate it).
let resetEpoch = 0;

app.get('/api/reset-epoch', (_req, res) => {
  res.json({ epoch: resetEpoch });
});

// Admin endpoint: POST /api/admin/reset-all  { secret }
// Increments the reset epoch so every client wipes its localStorage.
app.post('/api/admin/reset-all', (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== UNLOCK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  resetEpoch++;
  console.log(`[ADMIN] Global reset triggered — epoch is now ${resetEpoch}`);
  res.json({ ok: true, epoch: resetEpoch });
});

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

// Void ending / bad-ending messages (served from server to avoid hard-coding on client)
const VOID_MESSAGES = [
  { t: 2, text: 'You were never meant to reach the end.' },
  { t: 5, text: 'The Abyss has no bottom.' },
  { t: 8, text: 'You fall… and fall… and fall…' },
  { t: 12, text: 'Next Fragment: HOPE AND DESPAIR' },
];

app.get('/api/void-messages', (_req, res) => {
  res.json({ messages: VOID_MESSAGES });
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
  5: `[
[AUDIO LOG – TRANSCRIPT]
Case: Braddock Manor
Recording: ██/██/████ – 02:13 A.M.
Source: Telephone line tap – Detective Bureau
Participants: Detective Mark Havers / Officer Lily Carter

Mark: Lily? Are you there? Please tell me it's you...

Lily: …Mark? It’s Lily. I got your message. Why are you calling at this hour?

Mark: Thank you for picking up. I wasn’t sure you would. I needed… I needed a voice that isn’t echoing.

Lily: You sound terrible. Are you at home?

Mark: No. I’m at the office...

Lily: Is this about Braddock Manor again? Mark, the case is closed. They’ve reassigned everyone. You’re off it.

Mark: On paper. But paper doesn’t reach where I’ve been. I went back, but i ended up into another place.

[Brief silence. Only the faint hum of the line.]

Lily: …You mean that place you keep talking about in your notes? The “Abyss” from the old legends? Mark, listen, you’re exhausted. You need—

Mark: I’m not delirious. I crossed over. There’s something beneath that manor. Not a basement. Not a tunnel. A… descent. A place that isn’t supposed to exist.

Lily: Then tell me. Slowly. What did you see down there?

Mark: You don’t really see it at first. It’s like the world runs out of surface. No floor, no walls, no sky, just the absolute nothing. You stand on something that feels solid, but it isn’t there.

Lily: That doesn’t make sense.

Mark: Neither does a house full of people vanishing without a trace. You asked what I saw!

Lily: And the creature? Was it there?

Mark: Yes. But it wasn’t some beast with fangs. It was… absence given shape. Wherever it moved, the world seemed thinner, like a piece of reality had been erased. You couldn’t focus your eyes on it. You just knew something wasn’t where it should be.

Lily: Did it come for you?

Mark: No. It was already there. I was the intruder. It was watching something else.

Lily: The child?

[The line crackles softly. Mark’s breathing grows slightly uneven.]

Mark: Yes. I saw her....

Lily: Did she see you?

Mark: I don't think so. The creature didn't let her be aware of my presence...

Lily: Mark… you told me that was just rumor. That the child—

Mark: Was Braddock’s. That’s what the records say. But blood doesn’t always follow paperwork Lily.

Lily: What about the Braddocks? The servants? Did you see them?

Mark: Not as bodies. I felt them. It was like their guilt had been nailed to the walls of that chasm. Their secrets stretched out into the dark, hanging there, exposed. I swear i sound crazy but in that place...

Lily: Did it speak to you? The creature?

Mark: Not with words. But when it turned toward me, I understood. It hadn’t simply taken her. It had answered to her...

Lily: Are you saying she called it?

Mark: No i don't think so, not any child can conjure a creature from another dimension.

[A low hum on the line. Lily exhales slowly.]

Lily: And you… what did it want from you?

Mark: It wanted me to see. To understand that I’m bound to that place. That I helped build the road that led her there.

Lily: Are you going back there? To that place?

Mark: One day. I don’t think you visit the Abyss just once. I think it’s a debt that comes due. But I’m not done up here yet. There are other files on my desk that look too familiar.

Lily: Mark… if it ever starts to pull you back promise me you’ll call. Don’t go alone.

Mark: I already went alone, Lily. The best I can do is make sure you’re not blind when your turn comes. That’s why this call matters.

Lily: Understood. I’ll keep a copy of this off the record. Somewhere they won’t look.

Mark: Then at least the truth will have one more place to hide...

[End of recording.]]`,
  // Secret archive (content assigned below so we can build data-URI images)
};

// Build three small SVG data-URI images and assign to the secret archive (5.5)
const makeSvgDataUri = (bg, label) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="120" fill="#ffffff" font-family="Arial, Helvetica, sans-serif">${label}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
};

// Prefer embedding a local `childNmonster.png` (server-assets/) for the first image.
const childImgPath = path.join(__dirname, 'server-assets', 'childNmonster.png');
let childDataUri = null;
try {
  if (fs.existsSync(childImgPath)) {
    const data = fs.readFileSync(childImgPath);
    childDataUri = 'data:image/png;base64,' + data.toString('base64');
  }
} catch (e) { childDataUri = null }

const secretImgs = [
  childDataUri || makeSvgDataUri('black', '1'),
  makeSvgDataUri('black', '2'),
  makeSvgDataUri('black', '3'),
];

ARCHIVES_CONTENT[5.5] = `
<div style="display:flex;gap:5rem;align-items:center;justify-content:center;flex-wrap:wrap">
  <img src="${secretImgs[0]}" style="width:320px;transform:rotate(-6deg);box-shadow:0 6px 18px rgba(0,0,0,0.25);border-radius:6px;"/>
  <img src="${secretImgs[1]}" style="width:320px;transform:rotate(6deg);box-shadow:0 6px 18px rgba(0,0,0,0.25);border-radius:6px;"/>
  <img src="${secretImgs[2]}" style="width:320px;transform:rotate(-6deg);box-shadow:0 6px 18px rgba(0,0,0,0.25);border-radius:6px;"/>
</div>
`;

// Map archive IDs to their required fragment
const ARCHIVE_FRAGMENT_MAP = {
  1: 'FirstFragment',
  2: 'SecondFragment',
  3: 'ThirdFragment',
  4: 'FourthFragment',
  5: 'FifthFragment',
  5.5: 'Secret5_5',
};

// Client can POST here after an in-game event (boss defeat) to receive an
// HMAC-signed unlock proof for the secret archive. This is intentionally
// simple: clients must call this endpoint to obtain the server-signed proof
// which will then be stored alongside other unlock proofs in localStorage.
app.post('/api/claim-secret', (req, res) => {
  // In a more secure setup we'd require additional verification. For now,
  // simply issue the unlock proof so the client can access archive 5.5.
  const proof = createUnlockProof('Secret5_5')
  res.json({ fragment: 'Secret5_5', proof })
})

// Serve archive content (requires valid unlock proof for the matching fragment)
app.post('/api/archive-content', (req, res) => {
  const { archiveId, unlockProofs } = req.body;

  // Accept archive IDs 1-5, and the special secret archive (5.5).
  if (!archiveId || typeof archiveId !== 'number' || (!((archiveId >= 1 && archiveId <= 5) || archiveId === 5.5))){
    return res.status(400).json({ error: 'Invalid archive ID' });
  }

  if (!Array.isArray(unlockProofs)) {
    return res.status(400).json({ error: 'Invalid proofs' });
  }

  // Find the fragment required for this archive
  const requiredFragment = ARCHIVE_FRAGMENT_MAP[archiveId];

  // Check that the user has a valid unlock proof for the specific fragment.
  // Allow a client-side fallback proof for Secret5_5 so local/offline dev can
  // still view the secret archive when the claim endpoint failed earlier.
  const hasProof = unlockProofs.some(entry => {
    if (!entry || !entry.fragment || !entry.proof) return false
    if (entry.fragment === 'Secret5_5' && entry.proof === 'CLIENT-FALLBACK') return true
    return entry.fragment === requiredFragment && verifyUnlockProof(entry.proof, requiredFragment)
  })

  if (!hasProof) {
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
  if (!token || !fragment || fragment !== 'FifthFragment') {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!verifyToken(token, fragment)) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  res.json({ url: REWARD_URL });
});

// Image schedule for ThirdFragment (server-side only)
// Images cycle every 30 minutes across the full 24-hour day
const IMAGE_SCHEDULE = [
  { time: [0, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [0, 30],  file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [1, 0],  file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [1, 30],  file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [2, 0],  file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [2, 30],  file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [3, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [3, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [4, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [4, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [5, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [5, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [6, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [6, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [7, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [7, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [8, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [8, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [9, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [9, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [10, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [10, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [11, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [11, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [12, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [12, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [13, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [13, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [14, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [14, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [15, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [15, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [16, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [16, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [17, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [17, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [18, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [18, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [19, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [19, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [20, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [20, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [21, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [21, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
  { time: [22, 0], file: 'HappyFamily_pt4.png', label: 'Part 4' },
  { time: [22, 30], file: 'HappyFamily_pt1.png', label: 'Part 1' },
  { time: [23, 0], file: 'HappyFamily_pt2.png', label: 'Part 2' },
  { time: [23, 30], file: 'HappyFamily_pt3.png', label: 'Part 3' },
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
    if (currentMinutes >= entryMinutes && currentMinutes < entryMinutes + 10) {
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
