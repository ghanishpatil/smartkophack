import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { EventProvider } from './context/EventContext.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { SmoothScroll } from './components/SmoothScroll.jsx'
import ClickSpark from './components/ui/ClickSpark.jsx'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <EventProvider>
            <ClickSpark sparkColor="#6366f1" sparkSize={10} sparkRadius={18} sparkCount={8} duration={500}>
              <SmoothScroll>
                <App />
              </SmoothScroll>
            </ClickSpark>
          </EventProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)


