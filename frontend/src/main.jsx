import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('PrismTone UI Error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', maxWidth: '640px', margin: '60px auto', background: '#111726', borderRadius: '14px', border: '1px solid rgba(239,68,68,0.4)', color: '#f1f5f9' }}>
          <h2 style={{ color: '#fca5a5', marginBottom: '10px' }}>Something went wrong in the UI</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>{String(this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Reload PrismTone
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
