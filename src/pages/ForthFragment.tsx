import './CSS/ForthFragment.css'
import { playClick } from '../utils/playClick'

function FourthFragment({ onGoBack }: { onGoBack: () => void }) {
  const handleGoBack = () => {
    playClick()
    onGoBack()
  }

  return (
    <div className="fourth-fragment-page">
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
      <div className="coming-soon-container">
        <div className="coming-soon-icon">🔮</div>
        <h1 className="coming-soon-title">The Abyss Stirs</h1>
        <p className="coming-soon-text">This fragment has not yet surfaced from the depths.</p>
        <div className="coming-soon-divider"></div>
        <p className="coming-soon-subtext">Something is forming in the void. Return when the shadows call.</p>
        <button className="coming-soon-hint" onClick={() => window.open('https://docs.google.com/forms/d/e/1FAIpQLSfQ0DJtSXJoDN2ABTbLk2kKg3QH4w4uyCDeNtzkw0PgM7dowg/viewform?usp=publish-editor', '_blank')}>
          Get your reward here
        </button>
        <div className="coming-soon-pulse"></div>
      </div>
    </div>
  )
}

export default FourthFragment
