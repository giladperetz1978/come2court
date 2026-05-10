import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import './index.css'
import App from './App.tsx'
import SplashScreen from './SplashScreen.tsx'

const isGithubPagesHost = window.location.hostname.endsWith('github.io')
const configuredPublicAppUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')

if (isGithubPagesHost && configuredPublicAppUrl) {
  try {
    const targetUrl = new URL(configuredPublicAppUrl)
    if (targetUrl.host !== window.location.host) {
      window.location.replace(`${configuredPublicAppUrl}/`)
      throw new Error('Redirecting to external app host...')
    }
  } catch (_error) {
    // Invalid URL in env var should not break app bootstrap.
  }
}

function Root() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      <AnimatePresence>{showSplash ? <SplashScreen onFinish={() => setShowSplash(false)} /> : null}</AnimatePresence>
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.error('service worker registration failed', error)
    })
  })
}

