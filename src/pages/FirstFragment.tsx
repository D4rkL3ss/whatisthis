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
      <div className="container">
        <h1 className="fragment-title">The First Mission</h1>
        <div className="image-container">
          <img src="/assets/firstmission.png" alt="First Mission" />
        </div>
      </div>
    </div>
  )
}

export default FirstFragment
