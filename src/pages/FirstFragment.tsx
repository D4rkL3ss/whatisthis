import './CSS/FirstFragment.css'

function FirstFragment() {
  const handleGoBack = () => {
    window.location.href = '/'
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
      <div className="header">
        
      </div>
      <div className="container">
        <h1 className="fragment-title">More Coming Soon...</h1>
      </div>
    </div>
  )
}

export default FirstFragment
