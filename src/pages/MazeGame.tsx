import { useRef, useEffect, useState, useCallback } from 'react'
// Debug overlay state
interface DebugState {
  show: boolean;
  invincible: boolean;
  reveal: boolean;
  noclip: boolean;
  showButtons: boolean;
  showSecret: boolean;
}
import './CSS/MazeGame.css'

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface Cell {
  walls: [boolean, boolean, boolean, boolean] // top, right, bottom, left
}

interface Enemy {
  cx: number; cy: number
  tx: number; ty: number
  progress: number
}

interface LevelCfg {
  cols: number; rows: number
  enemies: number; traps: number
  vis: number; speed: number
  chase: number; chaseP: number
}

interface BossProjectile {
  x: number; y: number
  vx: number; vy: number
  r: number
  kind: 'orb' | 'ring' | 'beam'
  life: number
  maxLife: number
  angle?: number    // for beams
  width?: number    // for beams
}

/* ═══════════════════════════════════════
   Config
   ═══════════════════════════════════════ */

const LEVELS: LevelCfg[] = [
  { cols: 15, rows: 15, enemies: 3,  traps: 5,  vis: 2.15, speed: 1.5, chase: 4, chaseP: 0.50 },
  { cols: 21, rows: 21, enemies: 6,  traps: 10,  vis: 2.15, speed: 2.0, chase: 6, chaseP: 0.65 },
  { cols: 25, rows: 25, enemies: 9, traps: 15, vis: 2.15, speed: 2.0, chase: 6, chaseP: 0.75 },
  { cols: 30, rows: 30, enemies: 12, traps: 15, vis: 2.15, speed: 2.25, chase: 8, chaseP: 0.75 },
  { cols: 35, rows: 35, enemies: 15, traps: 20, vis: 2.15, speed: 2.25, chase: 8, chaseP: 0.75 },
]

// Level 4 (index 3) has the secret passage, level 5 (index 4) is the final maze
const SECRET_LEVEL = 3

const DEATH_MSGS = [
  'The shadows consumed you.',
  'You were never meant to escape.',
  'The darkness swallows you whole.',
  'Your light has been extinguished.',
  'The Abyss claims another soul.',
  'You hear laughter as everything fades…',
  'The walls remember your screams.',
  'Even the darkness flinched.',
]

const TRANSITION_MSGS = [
  'The walls shift around you…\nDescending to depth 2.',
  'The air grows cold. Something watches.\nDepth 3.',
  'The ground trembles beneath you…\nDepth 4. Something ancient stirs.',
  'You can barely breathe. The walls are alive.\nFinal depth.',
]

const BUTTON_MSG = 'You felt something slightly open somewhere…'

const CANVAS = 700
const MOVE_CD = 130

/* ═══════════════════════════════════════
   Maze generation
   ═══════════════════════════════════════ */

const DIRS: [number, number, number, number][] = [
  [0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1],
]

function genMaze(cols: number, rows: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ walls: [true, true, true, true] as [boolean, boolean, boolean, boolean] }))
  )
  const vis = Array.from({ length: rows }, () => Array(cols).fill(false))
  const stack: [number, number][] = [[0, 0]]
  vis[0][0] = true
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const nbrs: [number, number, number, number][] = []
    for (const [dx, dy, w1, w2] of DIRS) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !vis[ny][nx])
        nbrs.push([nx, ny, w1, w2])
    }
    if (!nbrs.length) { stack.pop(); continue }
    const [nx, ny, w1, w2] = nbrs[Math.floor(Math.random() * nbrs.length)]
    grid[y][x].walls[w1] = false
    grid[ny][nx].walls[w2] = false
    vis[ny][nx] = true
    stack.push([nx, ny])
  }
  const extra = Math.floor(cols * rows * 0.20)
  let added = 0, att = 0
  while (added < extra && att < extra * 10) {
    att++
    const x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows)
    const di = Math.floor(Math.random() * 4)
    const [dx, dy, w1, w2] = DIRS[di]
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[y][x].walls[w1]) {
      grid[y][x].walls[w1] = false; grid[ny][nx].walls[w2] = false; added++
    }
  }
  return grid
}

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

function validMoves(grid: Cell[][], x: number, y: number, cols: number, rows: number): [number, number][] {
  const out: [number, number][] = []
  for (const [dx, dy, w] of DIRS) {
    if (!grid[y][x].walls[w]) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push([nx, ny])
    }
  }
  return out
}

function dirKey(e: KeyboardEvent): string | null {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': return 'up'
    case 'ArrowRight': case 'd': case 'D': return 'right'
    case 'ArrowDown': case 's': case 'S': return 'down'
    case 'ArrowLeft': case 'a': case 'A': return 'left'
    default: return null
  }
}

function placeHidden(cols: number, rows: number, avoid: { x: number; y: number }[]): { x: number; y: number } {
  let x: number, y: number
  do {
    x = Math.floor(Math.random() * cols)
    y = Math.floor(Math.random() * rows)
  } while ((x + y) < 4 || avoid.some(a => a.x === x && a.y === y))
  return { x, y }
}

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */

type Phase = 'intro' | 'playing' | 'dead' | 'transition' | 'complete' | 'void' | 'boss' | 'boss_dead' | 'boss_win'

export default function MazeGame({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keysRef = useRef(new Set<string>())
  const lastMoveRef = useRef(0)

  // Audio system (synthesized; avoids needing external assets)
  const audioCtxRef = useRef<AudioContext | null>(null)

  function ensureAudio() {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      // try resume — may be required by browser
      audioCtxRef.current.resume().catch(() => {})
      return audioCtxRef.current
    } catch (e) { return null }
  }

  function playTone(freq: number, dur = 0.12, type: OscillatorType = 'sine', whenOffset = 0, gainPeak = 0.25) {
    const ctx = ensureAudio()
    if (!ctx) return
    const now = ctx.currentTime + whenOffset
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, now)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(gainPeak, now + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    o.connect(g); g.connect(ctx.destination)
    o.start(now); o.stop(now + dur + 0.02)
  }

  function playNoise(dur = 0.12, whenOffset = 0, gainPeak = 0.16) {
    const ctx = ensureAudio()
    if (!ctx) return
    const now = ctx.currentTime + whenOffset
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const src = ctx.createBufferSource(); src.buffer = buf
    const g = ctx.createGain(); g.gain.setValueAtTime(gainPeak, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(g); g.connect(ctx.destination)
    src.start(now)
  }

  function playStep() {
    // Prefer user-provided walking file; fall back to synthesized step
    try {
      const path = '/sounds/walking.mp3'
      if (!stepAudioRef.current) {
        stepAudioRef.current = new Audio(path)
        stepAudioRef.current.volume = 0.25
      }
      const a = stepAudioRef.current
      a.currentTime = 0
      a.play().catch(() => {
        playTone(520, 0.06, 'square', 0, 0.06)
        playNoise(0.05, 0.005, 0.03)
      })
    } catch (e) {
      playTone(520, 0.06, 'square', 0, 0.06)
      playNoise(0.05, 0.005, 0.03)
    }
  }

  function playDeath() {
    // descending wobble + noise
    playTone(300, 0.18, 'sawtooth', 0, 0.18)
    playTone(200, 0.25, 'sawtooth', 0.12, 0.12)
    playNoise(0.5, 0.06, 0.12)
  }

  function playTransition() {
    // small upward three-step (stairs)
    playTone(360, 0.10, 'sine', 0, 0.14)
    playTone(420, 0.10, 'sine', 0.08, 0.12)
    playTone(500, 0.12, 'sine', 0.16, 0.12)
  }

  // File-based audio helper and refs to control playback
  const endingAudioRef = useRef<HTMLAudioElement | null>(null)
  const stepAudioRef = useRef<HTMLAudioElement | null>(null)

  async function tryPlayFiles(paths: string[], loop = false, volume = 0.9): Promise<HTMLAudioElement | null> {
    if (!paths || paths.length === 0) return null
    for (const p of paths) {
      try {
        const a = new Audio(p)
        a.loop = loop
        a.volume = Math.min(Math.max(volume, 0), 1)
        // try play; some environments require a user gesture
        await a.play()
        return a
      } catch (err) {
        // try next file
        continue
      }
    }
    return null
  }

  async function playEndingWin() {
    // prefer user-provided files in /sounds, fallback to synth
    const files = ['/sounds/bossending.mp3']
    const a = await tryPlayFiles(files, false, 0.9)
    if (a) { endingAudioRef.current = a; return }
    // fallback synth
    playTone(880, 0.12, 'sine', 0, 0.18)
    playTone(1100, 0.12, 'sine', 0.12, 0.16)
    playTone(1320, 0.18, 'sine', 0.24, 0.12)
  }

  async function playEndingVoid() {
    const files = ['/sounds/badending.mp3']
    const a = await tryPlayFiles(files, true, 0.7)
    if (a) { endingAudioRef.current = a; return }
    // fallback continuous low rumble using WebAudio (looped oscillator)
    const ctx = ensureAudio()
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, ctx.currentTime)
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05)
    o.connect(g); g.connect(ctx.destination)
    o.start()
    // store a tiny wrapper object that we can stop later via endingAudioRef
    const wrapper = {
      audio: null as unknown as HTMLAudioElement,
      stop: () => { try { o.stop(); g.disconnect(); } catch {} }
    }
    // hack: assign a dummy HTMLAudioElement-like object to endingAudioRef so other code can treat it
    // but TypeScript expects HTMLAudioElement; we just null-check and call stop via wrapper.stop when present
    ;(endingAudioRef as any).current = wrapper
  }

  // stop any playing ending audio
  function stopEndingAudio() {
    const a = endingAudioRef.current as any
    if (!a) return
    try {
      if (typeof a.pause === 'function') { a.pause(); a.currentTime = 0 }
      if (typeof a.stop === 'function') a.stop()
    } catch (e) {}
    endingAudioRef.current = null
  }

  

  // Debug state
  const [debug, setDebug] = useState<DebugState>({ show: false, invincible: false, reveal: false, noclip: false, showButtons: false, showSecret: false })

  const gs = useRef({
    level: 0,
    grid: null as Cell[][] | null,
    px: 0, py: 0,
    ex: 0, ey: 0,
    enemies: [] as Enemy[],
    traps: [] as { x: number; y: number }[],
    t: 0,
    deaths: 0,
    stopped: false,
    // buttons (one per level 0,1,2)
    buttons: [
      { x: 0, y: 0, pressed: false },
      { x: 0, y: 0, pressed: false },
      { x: 0, y: 0, pressed: false },
    ],
    buttonsPressed: 0,
    // secret passage on level 3
    secretPos: { x: 0, y: 0 },
    secretOpen: false,
    // boss fight
    bossHp: 0,
    bossMaxHp: 0,
    bossX: 0, bossY: 0,
    bossPhase: 0,
    bossAttackTimer: 0,
    bossProjectiles: [] as BossProjectile[],
    bossVulnerable: false,
    bossVulnTimer: 0,
    bossFlash: 0,
    playerBossX: 0,
    playerBossY: 0,
    playerBossCellX: 0,
    playerBossCellY: 0,
    playerBossR: 10,
    playerBossSpeed: 200,
    playerAttackCd: 0,
    playerProjectiles: [] as { x: number; y: number; vx: number; vy: number; r: number; life: number }[],
    // void
    voidFallY: 0,
    voidT: 0,
    debugInvincible: false,
    debugReveal: false,
    debugNoclip: false,
    debugShowButtons: false,
    debugShowSecret: false,
  })

  const [phase, setPhase] = useState<Phase>('intro')
  const [dispLevel, setDispLevel] = useState(0)
  const [dispDeaths, setDispDeaths] = useState(0)
  const [deathMsg, setDeathMsg] = useState('')
  const [buttonNotice, setButtonNotice] = useState(false)
  const [portalNotice, setPortalNotice] = useState(false)
  const [voidStarted, setVoidStarted] = useState(false)
  const [voidMessages, setVoidMessages] = useState<{ t: number; text: string }[] | null>(null)
  const [showSecretModal, setShowSecretModal] = useState(false)

  // Persistent death counter storage
  const DEATHS_KEY = 'maze_total_deaths'
  function loadDeathsFromStorage() {
    try { const v = parseInt(localStorage.getItem(DEATHS_KEY) || '0', 10); return isNaN(v) ? 0 : v } catch (e) { return 0 }
  }
  function saveDeathsToStorage(n: number) { try { localStorage.setItem(DEATHS_KEY, String(n)) } catch (e) {} }

  useEffect(() => {
    const n = loadDeathsFromStorage()
    gs.current.deaths = n
    setDispDeaths(n)
  }, [])

  // Listen for app-level secret reset (when user clears data) and clear local state
  useEffect(() => {
    const onSecretReset = () => {
      try { localStorage.removeItem('secret-5-5-unlocked') } catch (e) {}
      setShowSecretModal(false)
    }
    window.addEventListener('secret-reset', onSecretReset as EventListener)
    return () => window.removeEventListener('secret-reset', onSecretReset as EventListener)
  }, [])

  /* ── show button notice ── */
  const showButtonNotice = useCallback(() => {
    setButtonNotice(true)
    setTimeout(() => setButtonNotice(false), 3000)
  }, [])

  /* ── show portal notice ── */
  const showPortalNotice = useCallback(() => {
    setPortalNotice(true)
    setTimeout(() => setPortalNotice(false), 3000)
  }, [])
  // Show portal message when entering level 4 and all 3 buttons are pressed
  useEffect(() => {
    if (gs.current.level === 3 && gs.current.buttonsPressed >= 3) {
      showPortalNotice();
    }
  }, [dispLevel]);

  // fetch void messages from server (so text isn't bundled client-side)
  useEffect(() => {
    let cancelled = false
    fetch('/api/void-messages').then(r => r.json()).then(j => {
      if (cancelled) return
      if (j && Array.isArray(j.messages)) setVoidMessages(j.messages)
    }).catch(() => {
      // ignore — we'll fall back to hard-coded strings below
    })
    return () => { cancelled = true }
  }, [])

  // stop ending audio when phase changes away from endings
  useEffect(() => {
    if (phase !== 'void' && phase !== 'boss_win') stopEndingAudio()
  }, [phase])

  // play win ending when boss_win is entered
  useEffect(() => {
    if (phase === 'boss_win') playEndingWin()
  }, [phase])

  // Unlock Secret Archive 5.5 when boss is defeated
  useEffect(() => {
    if (phase === 'boss_win') {
      // Request a server-signed unlock proof for the secret archive and store
      // it with other unlocked fragments so the app can fetch the archive.
      fetch('/api/claim-secret', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(r => {
          if (!r.ok) throw new Error(`claim-secret failed: ${r.status}`)
          return r.json()
        })
        .then((j) => {
          try {
            const stored = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
            const entries = stored.length > 0 && typeof stored[0] === 'object' ? stored : []
            if (!entries.some((e: any) => e.fragment === j.fragment)) {
              entries.push({ fragment: j.fragment, proof: j.proof })
                  localStorage.setItem('unlockedFragments', JSON.stringify(entries))
                  try { window.dispatchEvent(new Event('unlockedFragmentsChanged')) } catch (e) {}
            }
          } catch (e) {
            try { localStorage.setItem('unlockedFragments', JSON.stringify([{ fragment: j.fragment, proof: j.proof }])) } catch {}
                try { window.dispatchEvent(new Event('unlockedFragmentsChanged')) } catch (e) {}
          }
        })
        .catch(() => {
          // Fallback to a client-only unlock if server claim fails.
          // Store the fragment in `unlockedFragments` (same format App expects)
          console.warn('claim-secret failed; applying client-side unlock fallback')
          try {
            const stored = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
            const entries = stored.length > 0 && typeof stored[0] === 'object' ? stored : []
            if (!entries.some((e: any) => e.fragment === 'Secret5_5')) {
              entries.push({ fragment: 'Secret5_5', proof: 'CLIENT-FALLBACK' })
              localStorage.setItem('unlockedFragments', JSON.stringify(entries))
              try { window.dispatchEvent(new Event('unlockedFragmentsChanged')) } catch (e) {}
            }
          } catch (e) {
            try { localStorage.setItem('unlockedFragments', JSON.stringify([{ fragment: 'Secret5_5', proof: 'CLIENT-FALLBACK' }])) } catch (e) {}
            try { window.dispatchEvent(new Event('unlockedFragmentsChanged')) } catch (e) {}
          }
        })
    }
  }, [phase])

  /* ── debug overlay keybind ── */
  /* Debug overlay keybind disabled for production publish.  */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'b' || e.key === 'B') && (phase === 'playing' || phase === 'boss')) {
        setDebug(d => ({ ...d, show: !d.show }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase])
  

  /* Sync debug state to gs.current disabled for publish.  */
  useEffect(() => {
    gs.current.debugInvincible = debug.invincible
    gs.current.debugReveal = debug.reveal
    gs.current.debugNoclip = debug.noclip
    gs.current.debugShowButtons = debug.showButtons
    gs.current.debugShowSecret = debug.showSecret
  }, [debug])

  /* ── init level ── */
  const initLevel = useCallback((lvl: number) => {
    const cfg = LEVELS[lvl]
    const grid = genMaze(cfg.cols, cfg.rows)
    const s = gs.current
    s.level = lvl
    s.grid = grid
    s.px = 0; s.py = 0
    s.ex = cfg.cols - 1; s.ey = cfg.rows - 1
    s.stopped = false

    // enemies
    s.enemies = []
    const minD = Math.floor(Math.max(cfg.cols, cfg.rows) * 0.3)
    for (let i = 0; i < cfg.enemies; i++) {
      let ex: number, ey: number
      do { ex = Math.floor(Math.random() * cfg.cols); ey = Math.floor(Math.random() * cfg.rows) }
      while ((ex + ey) < minD || (ex === 0 && ey === 0) || (ex === s.ex && ey === s.ey))
      s.enemies.push({ cx: ex, cy: ey, tx: ex, ty: ey, progress: 1 })
    }

    // traps
    s.traps = []
    for (let i = 0; i < cfg.traps; i++) {
      let tx: number, ty: number
      do { tx = Math.floor(Math.random() * cfg.cols); ty = Math.floor(Math.random() * cfg.rows) }
      while ((tx + ty) < 3 || (tx === s.ex && ty === s.ey) || s.traps.some(t => t.x === tx && t.y === ty))
      s.traps.push({ x: tx, y: ty })
    }

    // hidden button for levels 0,1,2
    if (lvl >= 0 && lvl <= 2) {
      const avoid = [{ x: 0, y: 0 }, { x: s.ex, y: s.ey }, ...s.traps]
      const pos = placeHidden(cfg.cols, cfg.rows, avoid)
      s.buttons[lvl] = { x: pos.x, y: pos.y, pressed: false }
    }

    // secret passage on level 3
    if (lvl === SECRET_LEVEL) {
      const avoid = [{ x: 0, y: 0 }, { x: s.ex, y: s.ey }, ...s.traps]
      s.secretPos = placeHidden(cfg.cols, cfg.rows, avoid)
      s.secretOpen = s.buttonsPressed >= 3
    }

    setDispLevel(lvl)
  }, [])

  /* ── start / restart ── */
  const start = useCallback(() => {
    const s = gs.current
    // Keep cumulative death counter persisted across sessions; do not reset `s.deaths` here.
    s.buttonsPressed = 0; s.t = 0
    s.buttons.forEach(b => { b.pressed = false })
    setDispDeaths(s.deaths)
    setVoidStarted(false)
    initLevel(0)
    setPhase('playing')
  }, [initLevel])

  const retry = useCallback(() => {
    const s = gs.current
    // Do not reset `s.deaths` here so the death counter persists across retries
    s.buttonsPressed = 0; s.t = 0
    s.buttons.forEach(b => { b.pressed = false })
    // keep displayed death count as-is
    setVoidStarted(false)
    stopEndingAudio()
    initLevel(0)
    setPhase('playing')
  }, [initLevel])

  /* ── level transition ── */
  useEffect(() => {
    if (phase !== 'transition') return
    const next = gs.current.level + 1
    const timer = setTimeout(() => { initLevel(next); setPhase('playing') }, 2500)
    return () => clearTimeout(timer)
  }, [phase, initLevel])

  /* ── init boss ── */
  const initBoss = useCallback(() => {
    const s = gs.current
    s.bossHp = 100
    s.bossMaxHp = 100
    s.bossX = CANVAS / 2
    s.bossY = 120
    s.bossPhase = 0
    s.bossAttackTimer = 0
    s.bossProjectiles = []
    s.bossVulnerable = false
    s.bossVulnTimer = 0
    s.bossFlash = 0
    // compute arena grid and place player roughly centered
    const ARENA_L = 40, ARENA_R = CANVAS - 40, ARENA_T = 40, ARENA_B = CANVAS - 40
    const CELL = 40
    const gridCols = Math.floor((ARENA_R - ARENA_L) / CELL)
    const gridRows = Math.floor((ARENA_B - ARENA_T) / CELL)
    s.playerBossCellX = Math.floor(gridCols / 2)
    s.playerBossCellY = Math.floor(gridRows * 0.8)
    s.playerBossX = ARENA_L + (s.playerBossCellX + 0.5) * CELL
    s.playerBossY = ARENA_T + (s.playerBossCellY + 0.5) * CELL
    s.playerBossR = 10
    s.playerBossSpeed = 200
    s.playerAttackCd = 0
    s.playerProjectiles = []
    s.t = 0
    setPhase('boss')
  }, [])

  /* ═══════════════════════════════════════
     MAZE GAME LOOP
     ═══════════════════════════════════════ */
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = gs.current
    let prevTime = performance.now()
    let animId = 0

    const die = () => {
      if (s.debugInvincible) return;
      s.stopped = true; s.deaths++
      saveDeathsToStorage(s.deaths)
      setDispDeaths(s.deaths)
      setDeathMsg(DEATH_MSGS[Math.floor(Math.random() * DEATH_MSGS.length)])
      playDeath()
      // Play special audio when death count reaches 67
      try {
        if (s.deaths === 67) {
          const special = new Audio('/sounds/67.mp3')
          special.volume = 0.9
          special.play().catch(() => {})
        }
      } catch (e) {}
      setPhase('dead')
    }

    const loop = (now: number) => {
      const dt = Math.min((now - prevTime) / 1000, 0.1)
      prevTime = now; s.t += dt
      const cfg = LEVELS[s.level]

      // player movement
      if (now - lastMoveRef.current > MOVE_CD) {
        const dirs: [string, number, number, number][] = [
          ['up', 0, 0, -1], ['right', 1, 1, 0], ['down', 2, 0, 1], ['left', 3, -1, 0],
        ]
        for (const [key, wall, dx, dy] of dirs) {
            if (keysRef.current.has(key) && (s.debugNoclip || !s.grid![s.py][s.px].walls[wall as number])) {
            s.px += dx as number; s.py += dy as number
            lastMoveRef.current = now
            playStep()

            // trap?
            if (!s.debugInvincible && s.traps.some(t => t.x === s.px && t.y === s.py)) { die(); render(); return }

            // hidden button? (levels 0,1,2)
            if (s.level >= 0 && s.level <= 2) {
              const btn = s.buttons[s.level]
              if (!btn.pressed && s.px === btn.x && s.py === btn.y) {
                btn.pressed = true
                s.buttonsPressed++
                showButtonNotice()
                // update secret passage if we're revisiting
                if (s.buttonsPressed >= 3) s.secretOpen = true
              }
            }

            // secret passage? (level 3)
            if (s.level === SECRET_LEVEL && s.secretOpen && s.px === s.secretPos.x && s.py === s.secretPos.y) {
              s.stopped = true; initBoss(); render(); return
            }

            // exit?
            if (s.px === s.ex && s.py === s.ey) {
              if (s.level === SECRET_LEVEL) {
                // always allow normal exit on level 4
                s.stopped = true; playTransition(); setPhase('transition'); render(); return
              } else if (s.level >= LEVELS.length - 1) {
                // beat final level 5 normally → void too (shouldn't reach here but safety)
                s.stopped = true
                s.voidFallY = 0; s.voidT = 0
                playTransition(); setPhase('void')
                render(); return
              } else {
                s.stopped = true; playTransition(); setPhase('transition'); render(); return
              }
            }
            break
          }
        }
      }

      // enemy AI
      for (const e of s.enemies) {
        if (e.progress >= 1) {
          e.cx = e.tx; e.cy = e.ty; e.progress = 1
          const moves = validMoves(s.grid!, e.cx, e.cy, cfg.cols, cfg.rows)
          if (moves.length) {
            const md = Math.abs(e.cx - s.px) + Math.abs(e.cy - s.py)
            if (md <= cfg.chase && Math.random() < cfg.chaseP) {
              moves.sort((a, b) =>
                (Math.abs(a[0] - s.px) + Math.abs(a[1] - s.py)) -
                (Math.abs(b[0] - s.px) + Math.abs(b[1] - s.py)))
              ;[e.tx, e.ty] = moves[0]
            } else {
              ;[e.tx, e.ty] = moves[Math.floor(Math.random() * moves.length)]
            }
            e.progress = 0
          }
        } else {
          e.progress = Math.min(1, e.progress + dt * cfg.speed)
        }
        const ex2 = e.cx + (e.tx - e.cx) * e.progress
        const ey2 = e.cy + (e.ty - e.cy) * e.progress
        if (!s.debugInvincible && Math.hypot(ex2 - s.px, ey2 - s.py) < 0.6) { die(); render(); return }
      }

      render(); animId = requestAnimationFrame(loop)
    }

    function render() {
      if (!ctx || !s.grid) return
      const cfg = LEVELS[s.level]
      const cs = Math.floor(CANVAS / Math.max(cfg.cols, cfg.rows))
      const ox = Math.floor((CANVAS - cfg.cols * cs) / 2)
      const oy = Math.floor((CANVAS - cfg.rows * cs) / 2)

      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS, CANVAS)
      const px = ox + (s.px + 0.5) * cs
      const py = oy + (s.py + 0.5) * cs
      const fogR = (s.debugReveal ? 9999 : cfg.vis) * cs

      ctx.save(); ctx.beginPath(); ctx.arc(px, py, fogR, 0, Math.PI * 2); ctx.clip()

      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(ox, oy, cfg.cols * cs, cfg.rows * cs)

      // walls
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2
      for (let y = 0; y < cfg.rows; y++) {
        for (let x = 0; x < cfg.cols; x++) {
          const w = s.grid![y][x].walls
          const cx2 = ox + x * cs, cy2 = oy + y * cs
          if (w[0]) { ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + cs, cy2); ctx.stroke() }
          if (w[1]) { ctx.beginPath(); ctx.moveTo(cx2 + cs, cy2); ctx.lineTo(cx2 + cs, cy2 + cs); ctx.stroke() }
          if (w[2]) { ctx.beginPath(); ctx.moveTo(cx2, cy2 + cs); ctx.lineTo(cx2 + cs, cy2 + cs); ctx.stroke() }
          if (w[3]) { ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2, cy2 + cs); ctx.stroke() }
        }
      }

      // traps
      for (const tr of s.traps) {
        if (Math.abs(tr.x - s.px) + Math.abs(tr.y - s.py) <= 1.5) {
          ctx.fillStyle = 'rgba(139,0,0,0.25)'
          ctx.fillRect(ox + tr.x * cs + 2, oy + tr.y * cs + 2, cs - 4, cs - 4)
          ctx.strokeStyle = 'rgba(139,0,0,0.45)'; ctx.lineWidth = 1
          const h = cs * 0.28
          const tx2 = ox + (tr.x + 0.5) * cs, ty2 = oy + (tr.y + 0.5) * cs
          ctx.beginPath()
          ctx.moveTo(tx2 - h, ty2 - h); ctx.lineTo(tx2 + h, ty2 + h)
          ctx.moveTo(tx2 + h, ty2 - h); ctx.lineTo(tx2 - h, ty2 + h)
          ctx.stroke()
        }
      }

      // hidden button (levels 0,1,2)
      if (s.level >= 0 && s.level <= 2) {
        const btn = s.buttons[s.level]
        const showBtn = debug.showButtons || (!btn.pressed && Math.abs(btn.x - s.px) + Math.abs(btn.y - s.py) <= cfg.vis)
        if (showBtn) {
          const bx = ox + (btn.x + 0.5) * cs, by = oy + (btn.y + 0.5) * cs
          const pulse = Math.sin(s.t * 4) * 0.3 + 0.5
          ctx.fillStyle = `rgba(255,200,50,${pulse * 0.4})`
          ctx.fillRect(ox + btn.x * cs + 3, oy + btn.y * cs + 3, cs - 6, cs - 6)
          ctx.fillStyle = `rgba(255,200,50,${pulse})`
          ctx.beginPath(); ctx.arc(bx, by, cs * 0.15, 0, Math.PI * 2); ctx.fill()
        }
      }

      // secret passage (level 3)
      if (s.level === SECRET_LEVEL) {
        const sp = s.secretPos
        // Show secret passage when it's opened (regardless of distance), when debug reveals it, or when nearby
        const showSecret = s.secretOpen || debug.showSecret || (Math.abs(sp.x - s.px) + Math.abs(sp.y - s.py) <= 2)
        if (showSecret) {
          const sx = ox + (sp.x + 0.5) * cs, sy = oy + (sp.y + 0.5) * cs
          if (s.secretOpen) {
            const pulse = Math.sin(s.t * 2) * 0.3 + 0.7
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, cs * 0.8)
            sg.addColorStop(0, `rgba(0,255,150,${pulse * 0.7})`)
            sg.addColorStop(0.5, `rgba(0,180,100,${pulse * 0.3})`)
            sg.addColorStop(1, 'rgba(0,100,60,0)')
            ctx.fillStyle = sg
            ctx.beginPath(); ctx.arc(sx, sy, cs * 0.8, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = `rgba(0,255,150,${pulse})`
            ctx.font = `${cs * 0.5}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText('⬡', sx, sy)
          } else {
            // show closed crack
            ctx.strokeStyle = 'rgba(100,100,100,0.3)'; ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(sx - cs * 0.2, sy - cs * 0.3)
            ctx.lineTo(sx + cs * 0.1, sy); ctx.lineTo(sx - cs * 0.15, sy + cs * 0.3)
            ctx.stroke()
          }
        }
      }

      // exit glow
      const ep = Math.sin(s.t * 3) * 0.3 + 0.7
      const egx = ox + (s.ex + 0.5) * cs, egy = oy + (s.ey + 0.5) * cs
      if (s.level === SECRET_LEVEL + 1) {
        // Level 5 exit: RED/ominous
        const eg = ctx.createRadialGradient(egx, egy, 0, egx, egy, cs * 0.7)
        eg.addColorStop(0, `rgba(60,0,0,${ep * 0.6})`)
        eg.addColorStop(0.6, `rgba(30,0,0,${ep * 0.25})`)
        eg.addColorStop(1, 'rgba(10,0,0,0)')
        ctx.fillStyle = eg
        ctx.fillRect(ox + s.ex * cs, oy + s.ey * cs, cs, cs)
      } else {
        // All other levels (including 4): normal purple exit
        const eg = ctx.createRadialGradient(egx, egy, 0, egx, egy, cs * 0.7)
        eg.addColorStop(0, `rgba(120,0,220,${ep * 0.8})`)
        eg.addColorStop(0.6, `rgba(60,0,120,${ep * 0.35})`)
        eg.addColorStop(1, 'rgba(30,0,60,0)')
        ctx.fillStyle = eg
        ctx.fillRect(ox + s.ex * cs, oy + s.ey * cs, cs, cs)
      }

      // enemies
      for (const e of s.enemies) {
        const ex = e.cx + (e.tx - e.cx) * Math.min(e.progress, 1)
        const ey = e.cy + (e.ty - e.cy) * Math.min(e.progress, 1)
        const esx = ox + (ex + 0.5) * cs, esy = oy + (ey + 0.5) * cs
        ctx.fillStyle = 'rgba(20,0,0,0.9)'
        ctx.beginPath(); ctx.arc(esx, esy, cs * 0.35, 0, Math.PI * 2); ctx.fill()
        const eo = cs * 0.1, er = cs * 0.06
        const pulse = Math.sin(s.t * 5 + e.cx * 3) * 0.3 + 0.7
        ctx.fillStyle = `rgba(255,0,0,${pulse})`
        ctx.beginPath()
        ctx.arc(esx - eo, esy - eo * 0.5, er, 0, Math.PI * 2)
        ctx.arc(esx + eo, esy - eo * 0.5, er, 0, Math.PI * 2)
        ctx.fill()
        const egl = ctx.createRadialGradient(esx, esy, 0, esx, esy, cs * 0.8)
        egl.addColorStop(0, 'rgba(100,0,0,0.18)'); egl.addColorStop(1, 'rgba(100,0,0,0)')
        ctx.fillStyle = egl; ctx.beginPath(); ctx.arc(esx, esy, cs * 0.8, 0, Math.PI * 2); ctx.fill()
      }

      // player
      const pg = ctx.createRadialGradient(px, py, 0, px, py, cs * 0.6)
      pg.addColorStop(0, 'rgba(180,255,180,0.9)'); pg.addColorStop(0.5, 'rgba(100,200,100,0.35)'); pg.addColorStop(1, 'rgba(50,150,50,0)')
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, cs * 0.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#aaffaa'; ctx.beginPath(); ctx.arc(px, py, cs * 0.2, 0, Math.PI * 2); ctx.fill()

      ctx.restore()

      // If secret passage is open, draw a visible marker regardless of fog/vision
      if (s.level === SECRET_LEVEL && (s.secretOpen || debug.showSecret)) {
        const sp = s.secretPos
        const sx = ox + (sp.x + 0.5) * cs, sy = oy + (sp.y + 0.5) * cs
        const pulse = Math.sin(s.t * 2) * 0.3 + 0.7
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, cs * 0.9)
        sg.addColorStop(0, `rgba(0,255,150,${pulse * 0.7})`)
        sg.addColorStop(0.5, `rgba(0,180,100,${pulse * 0.4})`)
        sg.addColorStop(1, 'rgba(0,100,60,0)')
        ctx.fillStyle = sg
        ctx.beginPath(); ctx.arc(sx, sy, cs * 0.9, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(0,255,150,${pulse})`
        ctx.font = `${cs * 0.5}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('⬡', sx, sy)
      }

      // HUD
      ctx.fillStyle = '#555'; ctx.font = '13px monospace'; ctx.textAlign = 'left'
      ctx.fillText(`Depth ${s.level + 1}/5`, 8, 18)
      ctx.fillText(`Deaths: ${s.deaths}`, 8, 34)
      if (s.level <= 2 && !s.buttons[s.level].pressed) {
        ctx.fillStyle = '#333'; ctx.fillText('Something hides in the dark…', 8, CANVAS - 10)
      }
      // (No 'Seals broken' text; keep secret passage hidden)
    }

    animId = requestAnimationFrame(loop)

    const kd = (e: KeyboardEvent) => { const d = dirKey(e); if (d) { e.preventDefault(); keysRef.current.add(d) } }
    const ku = (e: KeyboardEvent) => { const d = dirKey(e); if (d) keysRef.current.delete(d) }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); keysRef.current.clear() }
  }, [phase, onComplete, initBoss, showButtonNotice])

  /* ═══════════════════════════════════════
     VOID FALLING LOOP
     ═══════════════════════════════════════ */
  useEffect(() => {
    if (phase !== 'void') return
    setVoidStarted(true)
    // start void ending sound (may be file or synthesized)
    playEndingVoid()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = gs.current
    s.voidFallY = 0; s.voidT = 0
    let prevTime = performance.now()
    let animId = 0

    const loop = (now: number) => {
      const dt = Math.min((now - prevTime) / 1000, 0.1)
      prevTime = now; s.voidT += dt; s.voidFallY += dt * (80 + s.voidT * 30)

      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS, CANVAS)

      // falling particles
      for (let i = 0; i < 40; i++) {
        const seed = i * 137.5
        const px = ((seed * 7.3 + s.voidFallY * 0.3) % CANVAS)
        const py = ((seed * 13.7 + s.voidFallY * (1 + i * 0.05)) % CANVAS)
        const alpha = 0.1 + (i % 5) * 0.04
        ctx.fillStyle = `rgba(60,20,80,${alpha})`
        ctx.fillRect(px, py, 2, 2 + i % 4)
      }

      // player silhouette falling
      const wobble = Math.sin(s.voidT * 3) * 8
      const playerY = CANVAS / 2 + Math.sin(s.voidT * 0.7) * 20
      const shrink = Math.max(0.5, 1 - s.voidT * 0.02)

      ctx.save()
      ctx.translate(CANVAS / 2 + wobble, playerY)
      ctx.scale(shrink, shrink)

      // faint green glow fading
      const glowAlpha = Math.max(0, 0.6 - s.voidT * 0.03)
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 20)
      pg.addColorStop(0, `rgba(100,200,100,${glowAlpha})`)
      pg.addColorStop(1, `rgba(50,150,50,0)`)
      ctx.fillStyle = pg
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = `rgba(170,255,170,${glowAlpha + 0.2})`
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // text that fades in (fetched from server when available; fallback to built-in)
      const vmFallback = [
        { t: 2, text: 'You were never meant to reach the end.' },
        { t: 5, text: 'The Abyss has no bottom.' },
        { t: 8, text: 'You fall… and fall… and fall…' },
        { t: 12, text: 'Next Fragment: HOPE AND DESPAIR' },
      ]
      const vms = voidMessages || vmFallback
      for (const m of vms) {
        if (s.voidT > m.t) {
          const alpha = m.t >= 12 ? Math.min(0.6, (s.voidT - m.t) * 0.15) : Math.min(1, (s.voidT - m.t) * 0.3)
          ctx.fillStyle = m.t >= 12 ? `rgba(80,80,80,${alpha})` : `rgba(100,30,30,${alpha})`
          if (m.t === 2) ctx.font = '22px Enigmatic, serif'
          else if (m.t === 5) ctx.font = '18px Enigmatic, serif'
          else if (m.t === 8) ctx.font = '16px Enigmatic, serif'
          else ctx.font = '14px monospace'
          ctx.textAlign = 'center'
          // vertical positions roughly match previous layout
          const y = m.t === 2 ? CANVAS / 2 - 60 : m.t === 5 ? CANVAS / 2 - 30 : m.t === 8 ? CANVAS / 2 : CANVAS / 2 + 40
          ctx.fillText(m.text, CANVAS / 2, y)
        }
      }

      // void ending audio should loop until player retries; do not stop automatically here

      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [phase])

  /* ═══════════════════════════════════════
     BOSS FIGHT LOOP
     ═══════════════════════════════════════ */
  useEffect(() => {
    if (phase !== 'boss') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = gs.current
    let prevTime = performance.now()
    let animId = 0

    const bossDie = () => {
      if (s.debugInvincible) return;
      s.stopped = true; s.deaths++
      saveDeathsToStorage(s.deaths)
      setDispDeaths(s.deaths)
      setDeathMsg('The creature crushed you like an insect.')
      playDeath()
      setPhase('boss_dead')
    }

    const loop = (now: number) => {
      const dt = Math.min((now - prevTime) / 1000, 0.1)
      prevTime = now; s.t += dt

      const ARENA_L = 40, ARENA_R = CANVAS - 40, ARENA_T = 40, ARENA_B = CANVAS - 40

      // ── Player movement (grid-based, discrete like the labyrinth) ──
      // Arena uses a 40px floor grid; move one cell per MOVE_CD when pressing a direction
      const CELL = 40
      const gridCols = Math.floor((ARENA_R - ARENA_L) / CELL)
      const gridRows = Math.floor((ARENA_B - ARENA_T) / CELL)
      if (now - lastMoveRef.current > MOVE_CD) {
        const moves: [string, number, number][] = [
          ['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0],
        ]
        for (const [key, dx, dy] of moves) {
            if (keysRef.current.has(key)) {
            const nx = s.playerBossCellX + dx
            const ny = s.playerBossCellY + dy
            if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
              s.playerBossCellX = nx; s.playerBossCellY = ny
              lastMoveRef.current = now
              playStep()
            }
            break
          }
        }
      }

      // compute pixel positions from discrete cell coordinates for rendering and collisions
      s.playerBossX = ARENA_L + (s.playerBossCellX + 0.5) * CELL
      s.playerBossY = ARENA_T + (s.playerBossCellY + 0.5) * CELL

      // set player radius to 70% of a grid cell (diameter = 0.7 * CELL)
      s.playerBossR = CELL * 0.35

      // ── Player attack (spacebar / touch) ──
      s.playerAttackCd -= dt
      if (keysRef.current.has('attack') && s.playerAttackCd <= 0 && s.bossVulnerable) {
        s.playerAttackCd = 0.35
        const ang = Math.atan2(s.bossY - s.playerBossY, s.bossX - s.playerBossX)
        s.playerProjectiles.push({
          x: s.playerBossX, y: s.playerBossY,
          vx: Math.cos(ang) * 350, vy: Math.sin(ang) * 350,
          r: 5, life: 2,
        })
      }

      // ── Player projectiles ──
      for (let i = s.playerProjectiles.length - 1; i >= 0; i--) {
        const p = s.playerProjectiles[i]
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt
        if (p.life <= 0 || p.x < 0 || p.x > CANVAS || p.y < 0 || p.y > CANVAS) {
          s.playerProjectiles.splice(i, 1); continue
        }
        // hit boss?
        if (s.bossVulnerable && Math.hypot(p.x - s.bossX, p.y - s.bossY) < 45) {
          s.bossHp -= 10 // reduced damage
          s.bossFlash = 0.15
          s.playerProjectiles.splice(i, 1)
          if (s.bossHp <= 0) {
            setPhase('boss_win')
            return
          }
        }
      }

      // ── Boss AI ──
      s.bossAttackTimer -= dt
      s.bossFlash = Math.max(0, s.bossFlash - dt)

      // Boss phases based on HP
      const hpPct = s.bossHp / s.bossMaxHp
      const bossPhase = hpPct > 0.6 ? 0 : hpPct > 0.3 ? 1 : 2

      // Vulnerability windows: boss becomes vulnerable after each attack pattern
      s.bossVulnTimer -= dt
      if (s.bossVulnTimer <= 0 && !s.bossVulnerable) {
        s.bossVulnerable = true
        s.bossVulnTimer = 2.5 - bossPhase * 0.5 // shorter windows as boss gets hurt
      }
      if (s.bossVulnerable && s.bossVulnTimer <= -(2.5 - bossPhase * 0.5)) {
        s.bossVulnerable = false
        s.bossVulnTimer = 3 - bossPhase * 0.6
      }

      // Boss attacks
      if (s.bossAttackTimer <= 0) {
        const patterns = bossPhase === 0
          ? ['spiral', 'aimed']
          : bossPhase === 1
          ? ['spiral', 'aimed', 'ring', 'beam']
          : ['spiral', 'aimed', 'ring', 'beam', 'barrage']

        const pattern = patterns[Math.floor(Math.random() * patterns.length)]
        const spd = 140 + bossPhase * 40

        if (pattern === 'aimed') {
          const ang = Math.atan2(s.playerBossY - s.bossY, s.playerBossX - s.bossX)
          for (let i = -1; i <= 1; i++) {
            const a = ang + i * 0.2
            s.bossProjectiles.push({ x: s.bossX, y: s.bossY, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, kind: 'orb', life: 5, maxLife: 5 })
          }
        } else if (pattern === 'spiral') {
          const n = 6 + bossPhase * 4
          for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i / n) + s.t * 2
            s.bossProjectiles.push({ x: s.bossX, y: s.bossY, vx: Math.cos(a) * spd * 0.8, vy: Math.sin(a) * spd * 0.8, r: 5, kind: 'orb', life: 4, maxLife: 4 })
          }
        } else if (pattern === 'ring') {
          const n = 12 + bossPhase * 6
          for (let i = 0; i < n; i++) {
            const a = Math.PI * 2 * i / n
            s.bossProjectiles.push({ x: s.bossX, y: s.bossY, vx: Math.cos(a) * spd * 0.6, vy: Math.sin(a) * spd * 0.6, r: 4, kind: 'ring', life: 5, maxLife: 5 })
          }
        } else if (pattern === 'beam') {
          const ang = Math.atan2(s.playerBossY - s.bossY, s.playerBossX - s.bossX)
          // Beam: long warning, short danger
          s.bossProjectiles.push({ x: s.bossX, y: s.bossY, vx: 0, vy: 0, r: 0, kind: 'beam', life: 2.0, maxLife: 2.0, angle: ang, width: 10 + bossPhase * 10 })
        } else if (pattern === 'barrage') {
          for (let i = 0; i < 8; i++) {
            setTimeout(() => {
              const ang = Math.atan2(s.playerBossY - s.bossY, s.playerBossX - s.bossX)
              const spread = (Math.random() - 0.5) * 0.6
              s.bossProjectiles.push({ x: s.bossX, y: s.bossY, vx: Math.cos(ang + spread) * spd * 1.2, vy: Math.sin(ang + spread) * spd * 1.2, r: 5, kind: 'orb', life: 4, maxLife: 4 })
            }, i * 100)
          }
        }

        s.bossAttackTimer = Math.max(0.6, 1.8 - bossPhase * 0.4)
      }

      // Boss slow movement
      const bSwayX = Math.sin(s.t * 0.7) * 80
      const bSwayY = Math.sin(s.t * 0.5) * 30
      s.bossX = CANVAS / 2 + bSwayX
      s.bossY = 100 + bSwayY

      // ── Boss projectiles ──
      for (let i = s.bossProjectiles.length - 1; i >= 0; i--) {
        const p = s.bossProjectiles[i]; p.life -= dt
        if (p.life <= 0) { s.bossProjectiles.splice(i, 1); continue }

        if (p.kind === 'beam') {
          // beam collision — check if player is within beam rectangle
          if (p.angle !== undefined && p.width !== undefined) {
            const beamLen = 800
            const dx = s.playerBossX - p.x, dy = s.playerBossY - p.y
            const along = dx * Math.cos(p.angle) + dy * Math.sin(p.angle)
            const perp = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle))
            if (along > 0 && along < beamLen && perp < p.width / 2 && p.life < p.maxLife - 0.3) {
              bossDie(); return
            }
          }
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt
          if (Math.hypot(p.x - s.playerBossX, p.y - s.playerBossY) < p.r + s.playerBossR) {
            bossDie(); return
          }
        }
      }

      // ── Render boss arena ──
      ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, CANVAS, CANVAS)

      // arena border
      ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 3
      ctx.strokeRect(ARENA_L, ARENA_T, ARENA_R - ARENA_L, ARENA_B - ARENA_T)

      // floor pattern
      ctx.strokeStyle = 'rgba(30,10,10,0.3)'; ctx.lineWidth = 1
      for (let x = ARENA_L; x < ARENA_R; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, ARENA_T); ctx.lineTo(x, ARENA_B); ctx.stroke()
      }
      for (let y = ARENA_T; y < ARENA_B; y += 40) {
        ctx.beginPath(); ctx.moveTo(ARENA_L, y); ctx.lineTo(ARENA_R, y); ctx.stroke()
      }

      // boss
      const bossGlow = s.bossFlash > 0
        ? 'rgba(255,255,255,0.8)'
        : s.bossVulnerable
          ? `rgba(255,200,50,${0.3 + Math.sin(s.t * 8) * 0.2})`
          : 'rgba(80,0,0,0.6)'

      // boss body
      ctx.save()
      ctx.translate(s.bossX, s.bossY)

      // outer glow
      const bg = ctx.createRadialGradient(0, 0, 20, 0, 0, 60)
      bg.addColorStop(0, bossGlow)
      bg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill()

      // core
      ctx.fillStyle = s.bossVulnerable ? 'rgba(200,150,50,0.9)' : 'rgba(40,0,0,0.95)'
      ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.fill()

      // eyes
      const eyePulse = Math.sin(s.t * 6) * 0.3 + 0.7
      ctx.fillStyle = `rgba(0,255,0,${eyePulse})`
      ctx.beginPath(); ctx.arc(-12, -8, 6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(12, -8, 6, 0, Math.PI * 2); ctx.fill()

      // tentacles
      ctx.strokeStyle = 'rgba(60,0,0,0.7)'; ctx.lineWidth = 3
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i / 6) + Math.sin(s.t * 2 + i) * 0.3
        const len = 40 + Math.sin(s.t * 3 + i * 2) * 10
        ctx.beginPath()
        ctx.moveTo(Math.cos(ang) * 30, Math.sin(ang) * 30)
        ctx.quadraticCurveTo(
          Math.cos(ang + 0.3) * (len * 0.7), Math.sin(ang + 0.3) * (len * 0.7),
          Math.cos(ang) * len, Math.sin(ang) * len
        )
        ctx.stroke()
      }
      ctx.restore()

      // HP bar
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(CANVAS / 2 - 100, 15, 200, 14)
      const hpW = Math.max(0, (s.bossHp / s.bossMaxHp) * 196)
      ctx.fillStyle = hpPct > 0.5 ? '#8b0000' : hpPct > 0.25 ? '#b22222' : '#ff4444'
      ctx.fillRect(CANVAS / 2 - 98, 17, hpW, 10)
      ctx.fillStyle = '#666'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('THE ABYSSAL ONE', CANVAS / 2, 12)
      if (s.bossVulnerable) {
        ctx.fillStyle = `rgba(255,200,50,${Math.sin(s.t * 6) * 0.4 + 0.6})`
        ctx.font = '11px monospace'
        ctx.fillText('VULNERABLE — ATTACK!', CANVAS / 2, 42)
      }

      // boss projectiles
      for (const p of s.bossProjectiles) {
        if (p.kind === 'beam' && p.angle !== undefined && p.width !== undefined) {
          const beamAlpha = p.life > p.maxLife - 0.3
            ? (p.maxLife - p.life) / 0.3 * 0.6
            : Math.min(0.6, p.life)
          ctx.save()
          ctx.translate(p.x, p.y); ctx.rotate(p.angle)
          ctx.fillStyle = `rgba(255,50,50,${beamAlpha})`
          ctx.fillRect(0, -p.width / 2, 800, p.width)
          // warning line before beam
          if (p.life > p.maxLife - 0.3) {
            ctx.strokeStyle = `rgba(255,100,100,${beamAlpha * 0.5})`
            ctx.lineWidth = 1; ctx.setLineDash([5, 5])
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(800, 0); ctx.stroke()
            ctx.setLineDash([])
          }
          ctx.restore()
        } else {
          ctx.fillStyle = p.kind === 'ring' ? 'rgba(200,0,200,0.8)' : 'rgba(255,80,80,0.85)'
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
          // glow
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2)
          gr.addColorStop(0, p.kind === 'ring' ? 'rgba(200,0,200,0.3)' : 'rgba(255,80,80,0.3)')
          gr.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2); ctx.fill()
        }
      }

      // player projectiles
      for (const p of s.playerProjectiles) {
        ctx.fillStyle = 'rgba(100,255,100,0.9)'
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }

      // player
      const ppg = ctx.createRadialGradient(s.playerBossX, s.playerBossY, 0, s.playerBossX, s.playerBossY, s.playerBossR * 2)
      ppg.addColorStop(0, 'rgba(180,255,180,0.9)'); ppg.addColorStop(0.5, 'rgba(100,200,100,0.35)'); ppg.addColorStop(1, 'rgba(50,150,50,0)')
      ctx.fillStyle = ppg; ctx.beginPath(); ctx.arc(s.playerBossX, s.playerBossY, s.playerBossR * 2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#aaffaa'; ctx.beginPath(); ctx.arc(s.playerBossX, s.playerBossY, s.playerBossR, 0, Math.PI * 2); ctx.fill()

      // HUD
      ctx.fillStyle = '#555'; ctx.font = '12px monospace'; ctx.textAlign = 'left'
      ctx.fillText(`Deaths: ${s.deaths}`, 8, CANVAS - 10)
      ctx.fillStyle = '#444'; ctx.textAlign = 'right'
      ctx.fillText('SPACE to attack when vulnerable', CANVAS - 8, CANVAS - 10)

      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)

    const kd = (e: KeyboardEvent) => {
      const d = dirKey(e)
      if (d) { e.preventDefault(); keysRef.current.add(d) }
      if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); keysRef.current.add('attack') }
    }
    const ku = (e: KeyboardEvent) => {
      const d = dirKey(e)
      if (d) keysRef.current.delete(d)
      if (e.key === ' ' || e.key === 'Space') keysRef.current.delete('attack')
    }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); keysRef.current.clear() }
  }, [phase, onComplete])

  /* ── touch helpers ── */
  const touch = (dir: string, on: boolean) => {
    if (on) keysRef.current.add(dir); else keysRef.current.delete(dir)
  }

  /* ═══════════════════════════════════════
     Render JSX
     ═══════════════════════════════════════ */

  // Simple debug overlay UI (compact floating panel).
  const debugOverlay = (
    <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 3000 }}>
      <div style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: 8, borderRadius: 6, minWidth: 160, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <strong>Debug</strong>
          <button style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }} onClick={() => setDebug(d => ({ ...d, show: !d.show }))}>{debug.show ? '▾' : '▸'}</button>
        </div>
        {debug.show && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={debug.invincible} onChange={() => setDebug(d => { const nd = { ...d, invincible: !d.invincible }; gs.current.debugInvincible = nd.invincible; return nd })} />
              Invincible
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={debug.reveal} onChange={() => setDebug(d => { const nd = { ...d, reveal: !d.reveal }; gs.current.debugReveal = nd.reveal; return nd })} />
              Reveal
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={debug.noclip} onChange={() => setDebug(d => { const nd = { ...d, noclip: !d.noclip }; gs.current.debugNoclip = nd.noclip; return nd })} />
              Noclip
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={debug.showButtons} onChange={() => setDebug(d => { const nd = { ...d, showButtons: !d.showButtons }; gs.current.debugShowButtons = nd.showButtons; return nd })} />
              Show Buttons
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={debug.showSecret} onChange={() => setDebug(d => { const nd = { ...d, showSecret: !d.showSecret }; gs.current.debugShowSecret = nd.showSecret; return nd })} />
              Show Secret
            </label>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="maze-game" style={{ position: 'relative' }}>
      {debugOverlay}
      <canvas ref={canvasRef} width={CANVAS} height={CANVAS} className="maze-canvas" />

      {/* Button notice */}
      {buttonNotice && (
        <div className="maze-button-notice">
          {BUTTON_MSG}
        </div>
      )}
      {/* Portal notice for level 4 with all buttons pressed */}
      {portalNotice && (
        <div className="maze-button-notice">
          You hear another portal open...
        </div>
      )}
      
      {/* Secret Archive modal */}
      {showSecretModal && (
        <div className="maze-overlay" style={{ zIndex: 2000 }}>
          <div className="maze-overlay__card">
            <h2 className="maze-overlay__title">Secret Archive 5.5</h2>
            <div className="maze-overlay__lore" style={{ whiteSpace: 'pre-wrap', maxHeight: '45vh', overflowY: 'auto' }}>
              <p>
                You have found the Secret Archive 5.5.
              </p>
              <p>
                This archive unlocks only after the Abyssal One has been defeated.
                Within, fragments of a forgotten narrative whisper of things between levels —
                places that twist the story's seams.
              </p>
              <p style={{ marginTop: 12, color: '#9b59b6' }}>
                Fragment ID: 5.5
              </p>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="maze-overlay__btn" onClick={() => setShowSecretModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Touch controls */}
      {(phase === 'playing' || phase === 'boss') && (
        <div className="maze-dpad">
          <button className="maze-dpad__btn maze-dpad__up"
            onPointerDown={() => touch('up', true)} onPointerUp={() => touch('up', false)} onPointerLeave={() => touch('up', false)}>▲</button>
          <div className="maze-dpad__row">
            <button className="maze-dpad__btn"
              onPointerDown={() => touch('left', true)} onPointerUp={() => touch('left', false)} onPointerLeave={() => touch('left', false)}>◀</button>
            {phase === 'boss' && (
              <button className="maze-dpad__btn maze-dpad__attack"
                onPointerDown={() => touch('attack', true)} onPointerUp={() => touch('attack', false)} onPointerLeave={() => touch('attack', false)}>⚔</button>
            )}
            <button className="maze-dpad__btn"
              onPointerDown={() => touch('right', true)} onPointerUp={() => touch('right', false)} onPointerLeave={() => touch('right', false)}>▶</button>
          </div>
          <button className="maze-dpad__btn maze-dpad__down"
            onPointerDown={() => touch('down', true)} onPointerUp={() => touch('down', false)} onPointerLeave={() => touch('down', false)}>▼</button>
        </div>
      )}

      {/* ── Intro ── */}
      {phase === 'intro' && (
        <div className="maze-overlay">
          <div className="maze-overlay__card">
            <div className="maze-overlay__icon">🕸️</div>
            <h2 className="maze-overlay__title">The Labyrinth</h2>
            <p className="maze-overlay__text">
              Navigate the Abyss. Find the exit. Survive.<br />
              One wrong step means death.<br />
              Death means starting over.<br /><br />
              <span style={{ color: '#c0392b' }}>The shadows are hunting you.</span><br />
              <span style={{ color: '#555', fontSize: '0.85rem' }}>Not everything is as it seems. Look carefully.</span>
            </p>
            <p className="maze-overlay__hint">Arrow keys / WASD to move</p>
            <button className="maze-overlay__btn" onClick={start}>Enter the Labyrinth</button>
          </div>
        </div>
      )}

      {/* ── Death (maze) ── */}
      {phase === 'dead' && (
        <div className="maze-overlay maze-overlay--death">
          <div className="maze-overlay__card">
            <h2 className="maze-overlay__title maze-overlay__title--death">{deathMsg}</h2>
            <p className="maze-overlay__text">Deaths: {dispDeaths}</p>
            <button className="maze-overlay__btn" onClick={retry}>Descend Again</button>
          </div>
        </div>
      )}

      {/* ── Death (boss) ── */}
      {phase === 'boss_dead' && (
        <div className="maze-overlay maze-overlay--death">
          <div className="maze-overlay__card">
            <h2 className="maze-overlay__title maze-overlay__title--death">{deathMsg}</h2>
            <p className="maze-overlay__text">Deaths: {dispDeaths}</p>
            <button className="maze-overlay__btn" onClick={retry}>Start Over</button>
          </div>
        </div>
      )}

      {/* ── Level Transition ── */}
      {phase === 'transition' && (
        <div className="maze-overlay maze-overlay--transition">
          <div className="maze-overlay__card">
            <h2 className="maze-overlay__title">{TRANSITION_MSGS[dispLevel]?.split('\n')[0]}</h2>
            <p className="maze-overlay__text">{TRANSITION_MSGS[dispLevel]?.split('\n')[1]}</p>
          </div>
        </div>
      )}

      {/* ── Void (infinite falling) ── */}
      {phase === 'void' && voidStarted && (
        <div className="maze-void-retry">
          <button className="maze-overlay__btn" onClick={retry}>…try again?</button>
        </div>
      )}

      {/* ── Boss Win ── */}
      {phase === 'boss_win' && (
        <div className="maze-overlay maze-overlay--complete">
          <div className="maze-overlay__card maze-overlay__card--lore">
            <h2 className="maze-overlay__title maze-overlay__title--complete">The Abyssal One disappears.</h2>
            <div className="maze-overlay__lore">
              <p>
                The creature runs, its form unraveling like smoke in a storm.
                The green eyes flicker once, twice, and then go dark.
              </p>
              <p>
                Before leaving, the creature whisper reaches you, not of malice,
                but of sorrow. The creature was never hunting you.
                It was guarding something.
              </p>
              <p style={{ color: '#7b5ea7', marginTop: '1.5rem' }}>
                You conclude the Abyss was never the enemy. It is the last refuge
                for those the world had already destroyed.
              </p>
            </div>
            <p className="maze-overlay__text" style={{ marginTop: '1rem' }}>
              Deaths: {dispDeaths}
            </p>
            <button className="maze-overlay__btn" style={{ marginTop: 24 }} onClick={onComplete}>Proceed</button>
          </div>
        </div>
      )}
    </div>
  )
}
