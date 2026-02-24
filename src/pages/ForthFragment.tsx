import { useState } from 'react'
import './CSS/ForthFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'
import MazeGame from './MazeGame'

function FourthFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'FourthFragment')
  const [gameCompleted, setGameCompleted] = useState(() => localStorage.getItem('maze_completed') === 'true')

  const handleGoBack = () => {
    playClick()
    onGoBack()
  }

  const handleGameComplete = () => {
    localStorage.setItem('maze_completed', 'true')
    setGameCompleted(true)
  }

  if (status === 'loading') {
    return <div className="fourth-fragment-page"><div className="container"><p style={{ color: '#aaa', fontSize: '1.2rem' }}>Verifying access...</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="fourth-fragment-page">
        <div className="container">
          <h1 style={{ color: '#c0392b', fontFamily: 'Enigmatic, serif' }}>Access Denied</h1>
          <p style={{ color: '#aaa', fontSize: '1rem' }}>The Abyss rejects your presence.</p>
          <button className="sound-toggle" onClick={handleGoBack} style={{ position: 'static', marginTop: '2rem' }}>← Back</button>
        </div>
      </div>
    )
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
      <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        {gameCompleted ? (
          <>
            <div className="coming-soon-container">
              <h1 className="coming-soon-title" style={{ color: '#7b5ea7' }}>The Labyrinth is Conquered</h1>
              <div className="coming-soon-divider"></div>
              <p className="coming-soon-subtext">You have already emerged from the Abyss.</p>
              <button className="coming-soon-hint" onClick={() => { setGameCompleted(false); localStorage.removeItem('maze_completed') }}>
                Descend Again
              </button>
            </div>
          </>
        ) : (
          <MazeGame onComplete={handleGameComplete} />
        )}
      </div>
    </div>
  )
}

export default FourthFragment
