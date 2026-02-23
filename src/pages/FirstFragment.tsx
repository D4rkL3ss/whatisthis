import './CSS/FirstFragment.css'
import firstMissionImg from '../assets/firstmission.png'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'

function FirstFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'FirstFragment')
  const handleGoBack = () => {
    playClick()
    onGoBack()
  }

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
          <img id="previewImage" src={firstMissionImg} alt="First Mission" />
          <div className="coming-soon-divider"></div>
          <a className="image-download" href={firstMissionImg} download>
            ⬇ Download Image
          </a>
        </div>
      </div>
    </div>
  )
}

export default FirstFragment
