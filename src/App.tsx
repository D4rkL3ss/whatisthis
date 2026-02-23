import { useState, useEffect, useRef } from 'react'
import { playClick, playPageFlip } from './utils/playClick'
import './styles/fonts.css';
import './App.css'
import FirstFragment from './pages/FirstFragment'
import SecondFragment from './pages/SecondFragment'
import ThirdFragment from './pages/ThirdFragment';
import FourthFragment from './pages/ForthFragment'

const ARCHIVES_META = [
  { id: 1, title: 'The First Mission', type: 'call' as const },
  { id: 2, title: 'The Creature of the Abyss', type: 'document' as const },
  { id: 3, title: 'Echoes of the Shattered', type: 'document' as const },
  { id: 4, title: 'The Detective\'s Journal', type: 'document' as const },
]

const FRAGMENT_LABELS: Record<string, string> = {
  FirstFragment: 'The First Mission',
  SecondFragment: 'The Creature of the Abyss',
  ThirdFragment: 'Echoes of the Shattered',
  FourthFragment: '???',
}

function App() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })
  const [isMuted, setIsMuted] = useState(() => sessionStorage.getItem('audioMuted') !== 'false')
  const [inputValue, setInputValue] = useState('')
  const [showFirstFragment, setShowFirstFragment] = useState(false)
  const [showSecondFragment, setShowSecondFragment] = useState(false)
  const [showThirdFragment, setShowThirdFragment] = useState(false)
  const [showFourthFragment, setShowFourthFragment] = useState(false)
  const [showError, setShowError] = useState(false)
  const [collectedShardNumber, setCollectedShardNumber] = useState<number | null>(null)
  const [isTimerBypassed, setIsTimerBypassed] = useState(false)
  const [unlockedCount, setUnlockedCount] = useState<number>(0)
  const [showArchivesDropdown, setShowArchivesDropdown] = useState(false)
  const [showCheckpointsDropdown, setShowCheckpointsDropdown] = useState(false)
  const [selectedArchive, setSelectedArchive] = useState<{ id: number; title: string; type: 'call' | 'document'; content: string } | null>(null)
  const [showWelcome, setShowWelcome] = useState(() => !sessionStorage.getItem('welcomeSeen'))
  const [revealStage, setRevealStage] = useState(() => sessionStorage.getItem('welcomeSeen') ? 3 : 0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [activeUsers, setActiveUsers] = useState<number | null>(null)
  const [showCounter, setShowCounter] = useState(false)
  const [fragmentToken, setFragmentToken] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const keySequenceRef = useRef<string>('')

  // Load previously unlocked fragments from localStorage
  const getUnlockedFragments = (): string[] => {
    try {
      const stored = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
      // Support new format: array of { fragment, proof } objects
      if (stored.length > 0 && typeof stored[0] === 'object') {
        return stored.map((entry: { fragment: string }) => entry.fragment)
      }
      // Legacy plain string array — treat as invalid (no proofs)
      return []
    } catch {
      return []
    }
  }

  const getUnlockProof = (fragment: string): string | null => {
    try {
      const stored = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
      if (stored.length > 0 && typeof stored[0] === 'object') {
        const entry = stored.find((e: { fragment: string; proof: string }) => e.fragment === fragment)
        return entry?.proof || null
      }
      return null
    } catch {
      return null
    }
  }

  const saveUnlockedFragment = (fragment: string, proof: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
      // Ensure new format
      const entries: { fragment: string; proof: string }[] =
        stored.length > 0 && typeof stored[0] === 'object' ? stored : []
      if (!entries.some(e => e.fragment === fragment)) {
        entries.push({ fragment, proof })
        localStorage.setItem('unlockedFragments', JSON.stringify(entries))
        setUnlockedCount(entries.length)
      }
    } catch {
      const entries = [{ fragment, proof }]
      localStorage.setItem('unlockedFragments', JSON.stringify(entries))
      setUnlockedCount(1)
    }
  }

  // Initialize counter from localStorage on mount
  useEffect(() => {
    setUnlockedCount(getUnlockedFragments().length)
  }, [])

  // SSE: subscribe to active-users stream
  useEffect(() => {
    const endpoint = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/active-users'
      : '/api/active-users'

    const es = new EventSource(endpoint)
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setActiveUsers(data.count)
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => {
      setActiveUsers(null)
    }
    return () => es.close()
  }, [])



  const isCountdownComplete = (timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) || isTimerBypassed

  useEffect(() => {
    let serverTimeOffset = 0
    let lastFetchTime = 0
    const FETCH_INTERVAL = 300000 // Fetch server time every 5 minutes

    const fetchServerTime = async () => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        
        // On localhost, use absolute URL to backend. On Render, use relative path.
        const endpoint = window.location.hostname === 'localhost' 
          ? 'http://localhost:3001/api/get-time'
          : '/api/get-time'
        
        const response = await fetch(endpoint, {
          signal: controller.signal
        })
        clearTimeout(timeout)
        
        if (!response.ok) throw new Error('Failed to fetch time')
        
        const data = await response.json()
        const serverTime = data.timestamp
        const localTime = new Date().getTime()
        serverTimeOffset = serverTime - localTime
        lastFetchTime = localTime
      } catch (error) {
        // Fall back to local time if server is unreachable
        serverTimeOffset = 0
      }
    }

    const calculateTimeLeft = () => {
      // Skip calculation if timer has been bypassed
      if (isTimerBypassed) return
      
      const targetDate = new Date('2026-02-23T19:30:00Z').getTime()
      const now = new Date().getTime()
      
      // Check if we need to refresh server time
      if (now - lastFetchTime > FETCH_INTERVAL) {
        fetchServerTime()
      }
      
      const adjustedNow = now + serverTimeOffset
      const difference = targetDate - adjustedNow

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        })
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }

    // Fetch server time once on mount
    fetchServerTime()
    
    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [isTimerBypassed])

  // Secret keyboard sequence listener
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Add the pressed key to the sequence
      keySequenceRef.current += e.key.toLowerCase()
      
      // Keep only the last 10 characters to match against
      if (keySequenceRef.current.length > 10) {
        keySequenceRef.current = keySequenceRef.current.slice(-10)
      }

      // Check if the sequence matches "counter" — toggle active users counter
      if (keySequenceRef.current.endsWith('counter')) {
        setShowCounter(prev => !prev)
        keySequenceRef.current = ''
      }

      // Check if the sequence matches "reset" — show reset confirmation
      if (keySequenceRef.current.endsWith('reset')) {
        setShowResetConfirm(true)
        keySequenceRef.current = ''
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  const handleResetCache = () => {
    localStorage.removeItem('unlockedFragments')
    sessionStorage.removeItem('welcomeSeen')
    sessionStorage.removeItem('audioMuted')
    setUnlockedCount(0)
    setShowResetConfirm(false)
    setShowWelcome(true)
    setRevealStage(0)
    setIsTimerBypassed(false)
    setIsMuted(true)
  }

  // Audio initialization
  useEffect(() => {
    const audioElement = audioRef.current
    if (audioElement) {
      audioElement.volume = 0.3
    }
  }, [])

  // Handle mute/unmute toggle
  useEffect(() => {
    sessionStorage.setItem('audioMuted', String(isMuted))
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(() => {
          // Silently handle playback failure
        })
      }
    }
  }, [isMuted])

  const pad = (num: number) => String(num).padStart(2, '0')

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedInput = inputValue.trim()
    
    if (!trimmedInput) {
      setShowError(true)
      return
    }

    try {
      // On localhost, use absolute URL to backend. On Render, use relative path.
      const endpoint = window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api/validate-code'
        : '/api/validate-code'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmedInput })
      })

      if (!response.ok) {
        setShowError(true)
        setInputValue('')
        return
      }

      const data = await response.json()

      if (data.valid && data.token && data.unlockProof) {
        const alreadyUnlocked = getUnlockedFragments().includes(data.fragment)
        setFragmentToken(data.token)

        if (alreadyUnlocked) {
          // Skip popup, go directly to fragment
          if (data.fragment === 'FirstFragment') setShowFirstFragment(true)
          else if (data.fragment === 'SecondFragment') setShowSecondFragment(true)
          else if (data.fragment === 'ThirdFragment') setShowThirdFragment(true)
          else if (data.fragment === 'FourthFragment') setShowFourthFragment(true)
        } else {
          // First time — show shard popup then navigate
          setCollectedShardNumber(data.shardNumber)
          saveUnlockedFragment(data.fragment, data.unlockProof)
          setTimeout(() => {
            if (data.fragment === 'FirstFragment') setShowFirstFragment(true)
            else if (data.fragment === 'SecondFragment') setShowSecondFragment(true)
            else if (data.fragment === 'ThirdFragment') setShowThirdFragment(true)
            else if (data.fragment === 'FourthFragment') setShowFourthFragment(true)
            setCollectedShardNumber(null)
          }, 3000)
        }
      } else {
        setShowError(true)
      }
    } catch (error) {
      // Server error or network issue
      setShowError(true)
    }

    setInputValue('')
  }

  const navigateToFragment = async (fragment: string) => {
    const unlockProof = getUnlockProof(fragment)
    if (!unlockProof) return

    try {
      const endpoint = window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api/reissue-token'
        : '/api/reissue-token'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fragment, unlockProof })
      })
      const data = await response.json()
      if (!data.valid) return
      setFragmentToken(data.token)
    } catch {
      return
    }

    if (fragment === 'FirstFragment') setShowFirstFragment(true)
    else if (fragment === 'SecondFragment') setShowSecondFragment(true)
    else if (fragment === 'ThirdFragment') setShowThirdFragment(true)
    else if (fragment === 'FourthFragment') setShowFourthFragment(true)
  }

  const goBack = () => {
    setShowFirstFragment(false)
    setShowSecondFragment(false)
    setShowThirdFragment(false)
    setShowFourthFragment(false)
    setFragmentToken(null)
  }

  if (showFirstFragment) {
    return (
      <>
        <audio id="ambient-audio" ref={audioRef} loop>
          <source src="/sounds/ambient.mp3" type="audio/mpeg" />
        </audio>
        <FirstFragment onGoBack={goBack} token={fragmentToken} />
      </>
    )
  }

  if (showSecondFragment) {
    return (
      <>
        <audio id="ambient-audio" ref={audioRef} loop>
          <source src="/sounds/ambient.mp3" type="audio/mpeg" />
        </audio>
        <SecondFragment onGoBack={goBack} token={fragmentToken} />
      </>
    )
  }

  if (showThirdFragment) {
    return (
      <>
        <audio id="ambient-audio" ref={audioRef} loop>
          <source src="/sounds/ambient.mp3" type="audio/mpeg" />
        </audio>
        <ThirdFragment onGoBack={goBack} token={fragmentToken} />
      </>
    )
  }

  if (showFourthFragment) {
    return (
      <>
        <audio id="ambient-audio" ref={audioRef} loop>
          <source src="/sounds/ambient.mp3" type="audio/mpeg" />
        </audio>
        <FourthFragment onGoBack={goBack} token={fragmentToken} />
      </>
    )
  }

  return (
    <>
      <audio id="ambient-audio" ref={audioRef} loop>
        <source src="/sounds/ambient.mp3" type="audio/mpeg" />
      </audio>
      <div className={`fragment-counter reveal-element ${revealStage >= 3 ? 'revealed' : ''}`}>
        {unlockedCount}/??? Fragments
      </div>
      {showCounter && activeUsers !== null && (
        <div className={`active-users-counter reveal-element ${revealStage >= 3 ? 'revealed' : ''}`}>
          👁️ {activeUsers} {activeUsers === 1 ? 'soul' : 'souls'} watching
        </div>
      )}
      <button 
        className={`sound-toggle reveal-element ${revealStage >= 3 ? 'revealed' : ''}`}
        onClick={() => { playClick(); setIsMuted(!isMuted) }}
        aria-label="Toggle ambient sound"
      >
        {isMuted ? '🔊 Enable Sound' : '🔇 Mute Sound'}
      </button>
      <div className={`header reveal-element ${revealStage >= 1 ? 'revealed' : ''}`}>
        <div className='title-container'>
           <img src="/vite.svg" className="logo" /><h1>The Fractured Abyss</h1>
        </div>
      </div>
      <div className={`container reveal-element ${revealStage >= 2 ? 'revealed' : ''}`}>
        {!isCountdownComplete && <div className="countdown-wrapper">
          <div className="countdown-card">
            <div className="countdown-number">{pad(timeLeft.days)}</div>
            <div className="countdown-label">Days</div>
          </div>
          <div className="countdown-card">
            <div className="countdown-number">{pad(timeLeft.hours)}</div>
            <div className="countdown-label">Hours</div>
          </div>
          <div className="countdown-card">
            <div className="countdown-number">{pad(timeLeft.minutes)}</div>
            <div className="countdown-label">Minutes</div>
          </div>
          <div className="countdown-card">
            <div className="countdown-number">{pad(timeLeft.seconds)}</div>
            <div className="countdown-label">Seconds</div>
          </div>
        </div>}
        {isCountdownComplete && (
          <form onSubmit={handleInputSubmit} className="code-input-form">
            <input
              type="text"
              className="code-input"
              placeholder="Enter the code..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className="code-submit-btn" onClick={playClick}>
              Submit
            </button>
          </form>
        )}
      </div>
      {isCountdownComplete && (
        <p className={`reveal-element ${revealStage >= 2 ? 'revealed' : ''}`} style={{ color: '#aaa', fontSize: '1.2rem', marginTop: '0.5rem', textAlign: 'center' }}>
          All codes are in CAPS and may have spaces.
        </p>
      )}
      {collectedShardNumber !== null && (
        <div className="shard-popup">
          <div className="shard-popup-content">
            <div className="shard-fragment">
              <div className="shard-glow"></div>
              <div className="shard-inner">💎</div>
            </div>
            <h2 className="shard-title">Fragment Collected</h2>
            <p className="shard-counter">{collectedShardNumber}/??? Shards Obtained</p>
          </div>
        </div>
      )}
      {showError && (
        <div className="error-popup">
          <div className="error-popup-content">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Access Denied</h2>
            <p className="error-message">The Abyss wasn't satisfied with your answer.</p>
            <button 
              className="error-close-btn"
              onClick={() => { playClick(); setShowError(false) }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Archives dropdown — bottom left */}
      <div className={`corner-dropdown corner-dropdown--left reveal-element ${revealStage >= 3 ? 'revealed' : ''}`}>
        <button
          className="corner-dropdown__trigger"
          onClick={() => { playClick(); setShowArchivesDropdown(p => !p); setShowCheckpointsDropdown(false) }}
        >
          📁 Archives ({unlockedCount}/4)
        </button>
        {showArchivesDropdown && (
          <div className="corner-dropdown__panel corner-dropdown__panel--left">
            {ARCHIVES_META.map(archive => {
              const unlocked = unlockedCount >= archive.id
              return (
                <button
                  key={archive.id}
                  className={`corner-dropdown__item${unlocked ? '' : ' corner-dropdown__item--locked'}`}
                  onClick={() => {
                    if (!unlocked) return
                    playPageFlip()
                    // Fetch archive content from server
                    const storedProofs = JSON.parse(localStorage.getItem('unlockedFragments') || '[]')
                    const endpoint = window.location.hostname === 'localhost'
                      ? 'http://localhost:3001/api/archive-content'
                      : '/api/archive-content'
                    fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ archiveId: archive.id, unlockProofs: storedProofs })
                    })
                      .then(res => res.json())
                      .then(data => {
                        if (data.content) {
                          setSelectedArchive({ ...archive, content: data.content })
                        }
                      })
                      .catch(() => {})
                  }}
                  disabled={!unlocked}
                >
                  {unlocked ? `📄 ${archive.title}` : `🔒 ??? (${archive.id}/4 shards)`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Checkpoints dropdown — bottom right */}
      <div className={`corner-dropdown corner-dropdown--right reveal-element ${revealStage >= 3 ? 'revealed' : ''}`}>
        <button
          className="corner-dropdown__trigger"
          onClick={() => { playClick(); setShowCheckpointsDropdown(p => !p); setShowArchivesDropdown(false) }}
        >
          🕳️ Abyss ({getUnlockedFragments().length}/4)
        </button>
        {showCheckpointsDropdown && (
          <div className="corner-dropdown__panel corner-dropdown__panel--right">
            {Object.entries(FRAGMENT_LABELS).map(([key, label]) => {
              const unlocked = getUnlockedFragments().includes(key)
              return (
                <button
                  key={key}
                  className={`corner-dropdown__item${unlocked ? '' : ' corner-dropdown__item--locked'}`}
                  onClick={() => { if (unlocked) { playClick(); setShowCheckpointsDropdown(false); navigateToFragment(key) } }}
                  disabled={!unlocked}
                >
                  {unlocked ? `✦ ${label}` : `🔒 ???`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Archive reader modal */}
      {selectedArchive && (
        <div className="archive-modal" onClick={() => setSelectedArchive(null)}>
          <div className={`archive-modal__content ${selectedArchive.type === 'call' ? 'archive-modal__content--call' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="archive-modal__scroll">
              <h2 className="archive-modal__title">{selectedArchive.title}</h2>
              <p className="archive-modal__body">{selectedArchive.content}</p>
              <button className="archive-modal__close" onClick={() => { playClick(); setSelectedArchive(null) }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome popup for new visitors */}
      {showWelcome && (
        <div className="welcome-popup">
          <div className="welcome-popup__content">
            <div className="welcome-popup__icon">⚠️</div>
            <h2 className="welcome-popup__title">Before You Enter</h2>
            <p className="welcome-popup__body">
              This website is a work in progress, I recommend you solve and discover the secrets of the abyss on your own, if you want to do it with a friend you're always welcome as well. Have fun!
            </p>
            <button className="welcome-popup__btn" onClick={() => {
              playClick()
              sessionStorage.setItem('welcomeSeen', '1')
              setShowWelcome(false)
              setIsMuted(false)
              setRevealStage(1)
              setTimeout(() => setRevealStage(2), 800)
              setTimeout(() => setRevealStage(3), 1600)
            }}>
              Enter the Abyss
            </button>
          </div>
        </div>
      )}

      {/* Debug: Reset cache confirmation popup */}
      {showResetConfirm && (
        <div className="error-popup">
          <div className="error-popup-content">
            <div className="error-icon">🔧</div>
            <h2 className="error-title">Reset All Data</h2>
            <p className="error-message">This will clear all checkpoints, fragments, and archives progress.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button
                className="error-close-btn"
                style={{ background: '#c0392b' }}
                onClick={() => { playClick(); handleResetCache() }}
              >
                Reset
              </button>
              <button
                className="error-close-btn"
                onClick={() => { playClick(); setShowResetConfirm(false) }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
