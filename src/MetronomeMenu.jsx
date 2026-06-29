import { useEffect, useRef, useState } from 'react'
import {
  METRONOME_METER_OPTIONS,
  METRONOME_SOUND_MODES,
} from './metronomeSamples'
import { audioDiag } from './audioDiagnostics'

export function MetronomeMenu({
  bpm,
  onBpmChange,
  soundMode,
  onSoundChange,
  meter,
  onMeterChange,
  isPlaying,
  onPlay,
  onStop,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const lastTransportActivationRef = useRef(0)

  // The Play/Stop control lives inside a popover whose close-away handler listens on the
  // document for `pointerdown`. In the iOS WKWebView a plain `onClick` is unreliable here
  // (the synthetic click can be dropped after the touch sequence), so we activate on
  // `pointerup`/`touchend` AND `click`, de-duplicated so a normal tap only toggles once.
  function activateTransport(source) {
    const now = Date.now()
    if (now - lastTransportActivationRef.current < 500) {
      audioDiag('metronome-tap', 'activation deduped', { source, isPlaying })
      return
    }
    lastTransportActivationRef.current = now

    audioDiag('metronome-tap', 'handler invoked', { source, isPlaying })
    if (isPlaying) {
      onStop()
    } else {
      onPlay()
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
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

          <div className="metronome-field-row">
            <label className="metronome-field">
              <span className="metronome-field-header">Meter</span>
              <select
                className="field-select field-select-compact"
                value={String(meter)}
                onChange={onMeterChange}
                aria-label="Metronome meter"
              >
                {METRONOME_METER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="metronome-field">
              <span className="metronome-field-header">Sound</span>
              <select
                className="field-select field-select-compact"
                value={soundMode}
                onChange={onSoundChange}
                aria-label="Metronome sound"
              >
                {METRONOME_SOUND_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            className={isPlaying ? 'pill-button inactive' : 'pill-button active'}
            // touch-action: manipulation removes the iOS double-tap delay and keeps the
            // tap from being swallowed as a gesture inside the WKWebView popover.
            style={{ touchAction: 'manipulation' }}
            // Stop the tap from reaching the document close-away handler so the popover
            // cannot close/re-render mid-tap and swallow the activation on iOS.
            onPointerDown={(event) => {
              event.stopPropagation()
              audioDiag('metronome-tap', 'pointerdown', { isPlaying })
            }}
            onPointerUp={(event) => {
              event.stopPropagation()
              activateTransport('pointerup')
            }}
            onTouchEnd={() => activateTransport('touchend')}
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
