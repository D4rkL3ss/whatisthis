import './CSS/SecondFragment.css'
import myVideo from '../assets/monstervideo.mp4'
import { playClick } from '../utils/playClick'

function SecondFragment({ onGoBack }: { onGoBack: () => void }) {

  const handleGoBack = () => {
      playClick()
      onGoBack()
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
          <video
            className="Video-media"
            autoPlay
            loop
            muted
            playsInline
            controls
            preload="metadata"
          >
            <source src={myVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          <div className="coming-soon-divider"></div>
          <a className="Video-download" href={myVideo} download>
            ⬇ Download Video
          </a>
        </div>
      </div>
    </div>
  )
}

export default SecondFragment
