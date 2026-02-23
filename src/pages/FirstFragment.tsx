import './CSS/FirstFragment.css'
import firstMissionImg from '../assets/firstmission.png'
import { playClick } from '../utils/playClick'

function FirstFragment({ onGoBack }: { onGoBack: () => void }) {
  const handleGoBack = () => {
    playClick()
    onGoBack()
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
