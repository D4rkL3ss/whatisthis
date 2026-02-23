import { useState, useEffect } from 'react'
import './CSS/ThirdFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'

function ThirdFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'ThirdFragment')
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleGoBack = () => {
    onGoBack()
  }

  // Fetch the active image from the server (schedule is server-side only)
  useEffect(() => {
    if (status !== 'verified' || !token) return

    const endpoint = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/fragment-image'
      : '/api/fragment-image'

    const update = () => {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fragment: 'ThirdFragment' })
      })
        .then(res => res.json())
        .then(data => {
          if (data.available && data.imageUrl) {
            const imageFullUrl = window.location.hostname === 'localhost'
              ? `http://localhost:3001${data.imageUrl}`
              : data.imageUrl
            setCurrentImage(imageFullUrl)
            setDownloadUrl(imageFullUrl)
          } else {
            setCurrentImage(null)
            setDownloadUrl(null)
          }
        })
        .catch(() => {
          setCurrentImage(null)
          setDownloadUrl(null)
        })
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [status, token])

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
              {downloadUrl && (
                <a className="image-download" href={downloadUrl} download>
                  ⬇ Download Image
                </a>
              )}
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
