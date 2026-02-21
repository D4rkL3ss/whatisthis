import './CSS/SecondFragment.css'

function SecondFragment() {
  const handleGoBack = () => {
    window.location.href = '/'
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
        
      </div>
    </div>
  )
}

export default SecondFragment
