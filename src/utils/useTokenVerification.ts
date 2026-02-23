import { useState, useEffect } from 'react'

type VerifyStatus = 'loading' | 'verified' | 'denied'

export function useTokenVerification(token: string | null, fragment: string): VerifyStatus {
  const [status, setStatus] = useState<VerifyStatus>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('denied')
      return
    }

    const endpoint = window.location.hostname === 'localhost'
      ? 'http://localhost:3001/api/verify-token'
      : '/api/verify-token'

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fragment })
    })
      .then(res => res.json())
      .then(data => setStatus(data.valid ? 'verified' : 'denied'))
      .catch(() => setStatus('denied'))
  }, [token, fragment])

  return status
}
