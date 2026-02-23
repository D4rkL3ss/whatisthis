import { useState, useEffect } from 'react'
import './CSS/SecondFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'

function SecondFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'SecondFragment')
  const [assetUrl, setAssetUrl] = useState<string | null>(null)

  const handleGoBack = () => {
      playClick()
      onGoBack()
  }

  useEffect(() => {
    if (status !== 'verified' || !token) return

    const endpoint = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/fragment-asset'
      : '/api/fragment-asset'

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fragment: 'SecondFragment' })
    })
      .then(res => res.json())
      .then(data => {
        if (data.assetUrl) {
          const url = window.location.hostname === 'localhost'
            ? `http://localhost:3001${data.assetUrl}`
            : data.assetUrl
          setAssetUrl(url)
        }
      })
      .catch(() => {})
  }, [status, token])

  if (status === 'loading') {
    return <div className="second-fragment-page"><div className="container"><p style={{ color: '#aaa', fontSize: '1.2rem' }}>Verifying access...</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="second-fragment-page">
        <div className="container">
          <h1 style={{ color: '#c0392b', fontFamily: 'Enigmatic, serif' }}>Access Denied</h1>
          <p style={{ color: '#aaa', fontSize: '1rem' }}>The Abyss rejects your presence.</p>
          <button className="sound-toggle" onClick={handleGoBack} style={{ position: 'static', marginTop: '2rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="second-fragment-page">
      <button 
        className="sound-toggle"
        onClick={handleGoBack}
        aria-label="Go back to main page"
        style={{
          top: '1.5rem',
          right: '1.5rem'
        }}
      >
        ← Back
      </button>
      <div className="container">
        <h1 className="fragment-title">The Lair of the Monster</h1>
        <div className="Video-container">
          {assetUrl ? (
            <>
              <video
                className="Video-media"
                autoPlay
                loop
                muted
                playsInline
                controls
                preload="metadata"
              >
                <source src={assetUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="coming-soon-divider"></div>
              <a className="Video-download" href={assetUrl} download>
                ⬇ Download Video
              </a>
            </>
          ) : (
            <p style={{ color: '#aaa', fontSize: '1.2rem' }}>Loading...</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default SecondFragment
