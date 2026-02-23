import { useState, useEffect } from 'react'
import './CSS/FirstFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'

function FirstFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'FirstFragment')
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
      body: JSON.stringify({ token, fragment: 'FirstFragment' })
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
    return <div className="first-fragment-page"><div className="container"><p style={{ color: '#aaa', fontSize: '1.2rem' }}>Verifying access...</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="first-fragment-page">
        <div className="container">
          <h1 style={{ color: '#c0392b', fontFamily: 'Enigmatic, serif' }}>Access Denied</h1>
          <p style={{ color: '#aaa', fontSize: '1rem' }}>The Abyss rejects your presence.</p>
          <button className="sound-toggle" onClick={handleGoBack} style={{ position: 'static', marginTop: '2rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="first-fragment-page">
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
        <h1 className="fragment-title">The First Mission</h1>
        <div className="image-container">
          {assetUrl ? (
            <>
              <img id="previewImage" src={assetUrl} alt="First Mission" />
              <div className="coming-soon-divider"></div>
              <a className="image-download" href={assetUrl} download>
                ⬇ Download Image
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

export default FirstFragment
