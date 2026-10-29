import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { logBackendSummary } from './lib/backends'
import { initTheme } from './lib/theme'

// Dev only: what's live, what's mocked, and whether this origin will work.
logBackendSummary()

// Day or Night before the first paint.
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
