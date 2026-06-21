import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { droneEngine } from './droneEngine'
import './index.css'
import App from './App.jsx'

if (import.meta.env.DEV) {
  window.moondroneDebug = {
    setPresetTransitionDebug: droneEngine.setPresetTransitionDebug.bind(droneEngine),
    setMoonChangeDebug: droneEngine.setMoonChangeDebug.bind(droneEngine),
    setMoonTransitionMode: droneEngine.setMoonTransitionMode.bind(droneEngine),
    setFullChainCrossfadeDebug: droneEngine.setFullChainCrossfadeDebug.bind(droneEngine),
    setNoteChangeDebug: droneEngine.setNoteChangeDebug.bind(droneEngine),
    setMoonTransitionIsolation: droneEngine.setMoonTransitionIsolation.bind(droneEngine),
    setClickDiagnostics: droneEngine.setClickDiagnostics.bind(droneEngine),
    setStringsIsolationMode: droneEngine.setStringsIsolationMode.bind(droneEngine),
    setStringsHighRegisterAirDebug: droneEngine.setStringsHighRegisterAirDebug.bind(droneEngine),
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
