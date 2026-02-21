import { useState, useEffect, useRef } from 'react'
import './styles/fonts.css';
import './App.css'
import FirstFragment from './pages/FirstFragment'

function App() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })
  const [isMuted, setIsMuted] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [showFirstFragment, setShowFirstFragment] = useState(false)
  const [showError, setShowError] = useState(false)
  const [showShardPopup, setShowShardPopup] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const isCountdownComplete = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0

  useEffect(() => {
    const calculateTimeLeft = () => {
      const targetDate = new Date('2026-02-24T17:30:00Z').getTime()
      const now = new Date().getTime()
      const difference = targetDate - now

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

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [])

  // Audio initialization
  useEffect(() => {
    const audioElement = document.getElementById('ambient-audio') as HTMLAudioElement
    audioRef.current = audioElement

    if (audioElement) {
      audioElement.volume = 0.3
      audioElement.addEventListener('error', () => {
        console.error('Audio error:', audioElement.error?.message)
      })
    }
  }, [])

  // Handle mute/unmute toggle
  useEffect(() => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch((err) => {
          console.error('Playback failed:', err)
        })
      }
    }
  }, [isMuted])

  const pad = (num: number) => String(num).padStart(2, '0')

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue == 'The First Fragment') {
      setShowShardPopup(true)
      setTimeout(() => {
        setShowFirstFragment(true)
      }, 3000)
    } else {
      setShowError(true)
    }
    setInputValue('')
  }

  if (showFirstFragment) {
    return <FirstFragment />
  }

  return (
    <>
      <audio id="ambient-audio" loop>
        <source src="/sounds/ambient.mp3" type="audio/mpeg" />
      </audio>      <button 
        className="sound-toggle"
        onClick={() => setIsMuted(!isMuted)}
        aria-label="Toggle ambient sound"
      >
        {isMuted ? '🔊 Enable Sound' : '🔇 Mute Sound'}
      </button>      <div className="header">
        <div className='title-container'>
           <img src="/vite.svg" className="logo" /><h1>The Fractured Abyss</h1>
        </div>
      </div>
      <div className="container">
        {timeLeft.days > 0 && <div className="countdown-wrapper">
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
            <button type="submit" className="code-submit-btn">
              Submit
            </button>
          </form>
        )}
      </div>
      {showShardPopup && (
        <div className="shard-popup">
          <div className="shard-popup-content">
            <div className="shard-fragment">
              <div className="shard-glow"></div>
              <div className="shard-inner">💎</div>
            </div>
            <h2 className="shard-title">Fragment Collected</h2>
            <p className="shard-counter">1/6 Shards Obtained</p>
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
              onClick={() => setShowError(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default App
