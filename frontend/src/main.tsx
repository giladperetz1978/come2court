import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Redirect GitHub Pages to VPS backend
const isGithubPages = window.location.hostname.endsWith('github.io')
const vpsUrl = 'http://144.91.96.77:8787'
if (isGithubPages) {
  window.location.replace(vpsUrl)
  throw new Error('Redirecting to VPS...')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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

