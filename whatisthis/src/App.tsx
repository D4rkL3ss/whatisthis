import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })

  useEffect(() => {
    const calculateTimeLeft = () => {
      const targetDate = new Date('???').getTime()
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

  const pad = (num: number) => String(num).padStart(2, '0')

  return (
    <>
      <div className="container">
        <a>
          <h1>It's Coming...</h1>
        </a>
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
      </div> 
    </>
  )
}

export default App
