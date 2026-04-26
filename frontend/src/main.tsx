import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const isGithubPagesHost = window.location.hostname.endsWith('github.io')
const publicAppUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || 'http://144.91.96.77:8787').replace(/\/$/, '')

if (isGithubPagesHost && publicAppUrl) {
  window.location.replace(`${publicAppUrl}/`)
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

