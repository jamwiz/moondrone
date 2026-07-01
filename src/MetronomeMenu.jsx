import { useEffect, useRef, useState } from 'react'
import { audioDiag } from './audioDiagnostics'
import { droneEngine } from './droneEngine'
import { isMediaPrimerStartupActive } from './mediaPrimerStartupGuard'

export function MetronomeMenu({
  bpm,
  onBpmChange,
  isPlaying,
  metronomeStartPendingRef,
  onPlay,
  onStop,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const lastTransportActivationRef = useRef(0)
  const playIssuedViaPointerRef = useRef(false)

  useEffect(() => {
    if (isPlaying) {
      playIssuedViaPointerRef.current = false
    }
  }, [isPlaying])

  // The Play/Stop control lives inside a popover whose close-away handler listens on the
  // document for `pointerdown`. In the iOS WKWebView a plain `onClick` is unreliable here
  // (the synthetic click can be dropped after the touch sequence), so we activate on the
  // pointerdown CAPTURE phase AND `click`, de-duplicated so a normal tap only toggles once.
  function activateTransport(source) {
    // Layer-1 diagnostic: prove the button event handler is entered, and capture the live state
    // it's deciding on (UI isPlaying prop + engine state + context + chain-ready value).
    audioDiag('metronome-tap', `event handler ENTERED via ${source}`, {
      uiIsPlaying: isPlaying,
      metronomeStartPending: metronomeStartPendingRef?.current === true,
      startupGuardActive: isMediaPrimerStartupActive(),
      ...(droneEngine.getMetronomeDiagnostics?.() ?? {}),
    })

    if (isPlaying) {
      playIssuedViaPointerRef.current = false
      const now = Date.now()
      if (now - lastTransportActivationRef.current < 500) {
        audioDiag('metronome-tap', 'activation deduped (ignored)', { source, isPlaying: true })
        return
      }
      lastTransportActivationRef.current = now
      audioDiag('metronome-tap', 'calling onStop()', { source })
      onStop()
      return
    }

    if (source === 'click') {
      if (
        playIssuedViaPointerRef.current
        || metronomeStartPendingRef?.current
        || isMediaPrimerStartupActive()
      ) {
        audioDiag('metronome-tap', 'click fallback skipped — play already pending via pointerdown', {
          source,
          playIssuedViaPointer: playIssuedViaPointerRef.current,
          metronomeStartPending: metronomeStartPendingRef?.current === true,
          startupGuardActive: isMediaPrimerStartupActive(),
        })
        playIssuedViaPointerRef.current = false
        return
      }
    }

    if (source === 'pointerdowncapture') {
      if (
        metronomeStartPendingRef?.current
        || isMediaPrimerStartupActive()
        || droneEngine.isStarting === true
      ) {
        audioDiag('metronome-tap', 'pointerdown skipped — metronome start already pending', {
          metronomeStartPending: metronomeStartPendingRef?.current === true,
          startupGuardActive: isMediaPrimerStartupActive(),
          engineIsStarting: droneEngine.isStarting === true,
        })
        return
      }
      playIssuedViaPointerRef.current = true
    }

    const now = Date.now()
    if (now - lastTransportActivationRef.current < 500) {
      audioDiag('metronome-tap', 'activation deduped (ignored)', { source, isPlaying })
      return
    }
    lastTransportActivationRef.current = now

    audioDiag('metronome-tap', 'calling onPlay()', { source })
    onPlay()
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event) {
      const container = containerRef.current
      if (!container) {
        return
      }

      // Ignore any pointerdown that originated inside the popover (trigger button, fields, or the
      // Play/Stop control) so the menu never closes/re-renders mid-tap and swallows the activation.
      // composedPath() is more robust than contains() for events that start on nested SVG/spans.
      const path = typeof event.composedPath === 'function' ? event.composedPath() : []
      if (container.contains(event.target) || path.includes(container)) {
        return
      }

      setIsOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="popover metronome-menu" ref={containerRef}>
      <button
        type="button"
        className={
          isPlaying
            ? 'header-icon-button metronome-trigger active'
            : 'header-icon-button metronome-trigger'
        }
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={isPlaying ? 'Metronome running. Open metronome' : 'Open metronome'}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg className="metronome-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8.5 3.5 h7 L19 20.5 H5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <line
            x1="12"
            y1="18"
            x2="15.5"
            y2="7.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {isPlaying ? <span className="metronome-running-dot" aria-hidden="true" /> : null}
      </button>

      {isOpen ? (
        <div className="popover-menu metronome-popover" role="menu" aria-label="Metronome">
          <div className="metronome-field">
            <div className="metronome-field-header">
              <span>Tempo</span>
              <span className="metronome-field-value">{bpm} BPM</span>
            </div>
            <input
              type="range"
              min="40"
              max="200"
              step="1"
              value={bpm}
              className="slider"
              aria-label="Metronome BPM"
              onChange={onBpmChange}
            />
          </div>

          <button
            type="button"
            className={isPlaying ? 'pill-button inactive' : 'pill-button active'}
            // touch-action: manipulation removes the iOS double-tap delay and keeps the
            // tap from being swallowed as a gesture inside the WKWebView popover.
            style={{ touchAction: 'manipulation' }}
            // Primary path: act on the CAPTURE phase of pointerdown — the earliest possible point,
            // before the document close-away handler or any re-render can interfere. preventDefault
            // + stopPropagation keep the tap from bubbling to the close-away listener and from
            // generating a competing click. onClick stays as a deduped fallback (desktop / a11y).
            onPointerDownCapture={(event) => {
              event.preventDefault()
              event.stopPropagation()
              audioDiag('metronome-tap', 'pointerdowncapture', { isPlaying })
              activateTransport('pointerdowncapture')
            }}
            onClick={() => activateTransport('click')}
            aria-label={isPlaying ? 'Stop metronome' : 'Start metronome'}
          >
            {isPlaying ? 'Stop' : 'Play'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
