
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './offline-status.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('TAPLEARN offline worker registration failed:', error)
    })
  })
}
