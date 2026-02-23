import { useState, useEffect } from 'react'
import './CSS/ThirdFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'
import happyfamilyPT1 from '../assets/HappyFamily_pt1.png'
import happyfamilyPT2 from '../assets/HappyFamily_pt2.png'
import happyfamilyPT3 from '../assets/HappyFamily_pt3.png'
import happyfamilyPT4 from '../assets/HappyFamily_pt4.png'

// 🕐 Schedule: [hour, minute]
const SCHEDULE = [
  { time: [15, 30], image: happyfamilyPT3, label: 'Part 3' },
  { time: [17, 30], image: happyfamilyPT1, label: 'Part 1' },
  { time: [19, 30], image: happyfamilyPT2, label: 'Part 2' },
  { time: [21, 30], image: happyfamilyPT4, label: 'Part 4' },
]

function getActiveImage() {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  let activeImage: string | null = null
  let activeLabel = 'No image yet'

  for (const entry of SCHEDULE) {
    const entryMinutes = entry.time[0] * 60 + entry.time[1]
    if (currentMinutes >= entryMinutes && currentMinutes <= entryMinutes + 5) {
      activeImage = entry.image
      activeLabel = entry.label
    }
  }

  return { activeImage, activeLabel }
}

function ThirdFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'ThirdFragment')
  const [currentImage, setCurrentImage] = useState<string | null>(null)

  const handleGoBack = () => {
    onGoBack()
  }

  // Update image every minute based on real time
  useEffect(() => {
    const update = () => {
      const { activeImage } = getActiveImage()
      setCurrentImage(activeImage)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'loading') {
    return <div className="third-fragment-page"><div className="container"><p style={{ color: '#aaa', fontSize: '1.2rem' }}>Verifying access...</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="third-fragment-page">
        <div className="container">
          <h1 style={{ color: '#c0392b', fontFamily: 'Enigmatic, serif' }}>Access Denied</h1>
          <p style={{ color: '#aaa', fontSize: '1rem' }}>The Abyss rejects your presence.</p>
          <button className="sound-toggle" onClick={() => { playClick(); handleGoBack() }} style={{ position: 'static', marginTop: '2rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="third-fragment-page">
      <button
        className="sound-toggle"
        onClick={() => { playClick(); handleGoBack() }}
        aria-label="Go back to main page"
        style={{ top: '1.5rem', right: '1.5rem' }}
      >
        ← Back
      </button>

      <div className="container">
        <h1 className="fragment-title">Happy Family</h1>

        <div className="image-container">
          {currentImage ? (
            <>
              <img id="previewImage" src={currentImage} alt="Third Mission" />
              <div className="coming-soon-divider"></div>
              <a className="image-download" href={currentImage} download>
                ⬇ Download Image
              </a>
            </>
          ) : (
            <p style={{ color: '#aaa', fontSize: '1rem', marginTop: '2rem' }}>
              <h1 style={{ fontFamily: 'Enigmatic, serif', fontSize: '3rem' }}>When the shadows align, shapes rise from the abyss.</h1>
            </p>
          )}
        </div>


      </div>
    </div>
  )
}

export default ThirdFragment
