import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { logBackendSummary } from './lib/backends'

// Dev only: what's live, what's mocked, and whether this origin will work.
logBackendSummary()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
