import { useState, useEffect } from 'react'
import './CSS/ThirdFragment.css'
import { playClick } from '../utils/playClick'
import { useTokenVerification } from '../utils/useTokenVerification'

function ThirdFragment({ onGoBack, token }: { onGoBack: () => void; token: string | null }) {
  const status = useTokenVerification(token, 'ThirdFragment')
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleGoBack = () => {
    onGoBack()
  }

  useEffect(() => {
  if (status !== 'verified' || !token) return;

  const apiHost = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
  let currentBlobUrl: string | null = null;

  const update = async () => {
    try {
      // 1. Check if an image is available in the current time slot
      const res = await fetch(`${apiHost}/api/fragment-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fragment: 'ThirdFragment' })
      });
      const data = await res.json();

      if (data.available && data.imageUrl) {
        // 2. Fetch the actual protected asset as a Blob
        const assetRes = await fetch(`${apiHost}${data.imageUrl}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (assetRes.ok) {
          const blob = await assetRes.blob();
          const secureUrl = URL.createObjectURL(blob);

          // Cleanup the OLD blob URL before setting the new one to save memory
          if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
          
          currentBlobUrl = secureUrl;
          setCurrentImage(secureUrl);
          setDownloadUrl(secureUrl);
        }
      } else {
        setCurrentImage(null);
        setDownloadUrl(null);
      }
    } catch (error) {
      console.error("Third Fragment Security Error:", error);
    }
  };

  update();
  const interval = setInterval(update, 60000);

  return () => {
    clearInterval(interval);
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  };
}, [status, token]);

  if (status === 'loading') {
    return <div className="third-fragment-page"><div className="container"><p style={{ color: '#aaa', fontSize: '1.2rem' }}>Verifying access...</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="third-fragment-page">
        <div className="container">
          <h1 style={{ color: '#c0392b', fontFamily: 'Enigmatic, serif' }}>Access Denied</h1>
          <p style={{ color: '#aaa', fontSize: '1rem' }}>The Abyss rejects your presence.</p>
          <button className="sound-toggle" onClick={() => { playClick(); handleGoBack() }} style={{ position: 'static', marginTop: '2rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="third-fragment-page">
      <button
        className="sound-toggle"
        onClick={() => { playClick(); handleGoBack() }}
        aria-label="Go back to main page"
        style={{ top: '1.5rem', right: '1.5rem' }}
      >
        ← Back
      </button>

      <div className="container">
        <h1 className="fragment-title">Happy Family</h1>

        <div className="image-container">
          {currentImage ? (
            <>
              <img id="previewImage" src={currentImage} alt="Third Mission" />
              <div className="coming-soon-divider"></div>
              {downloadUrl && (
                <a className="image-download" href={downloadUrl} download>
                  ⬇ Download Image
                </a>
              )}
            </>
          ) : (
            <p style={{ color: '#aaa', fontSize: '1rem', marginTop: '2rem' }}>
              <h1 style={{ fontFamily: 'Enigmatic, serif', fontSize: '3rem' }}>When the shadows align, shapes rise from the abyss.</h1>
            </p>
          )}
        </div>


      </div>
    </div>
  )
}

export default ThirdFragment
