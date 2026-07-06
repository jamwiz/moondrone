import { useEffect, useRef } from 'react'
import packageJson from '../package.json'
import { MOON_DESCRIPTIONS } from './moonLabels'
import { MOODS } from './moods'

const APP_VERSION = packageJson.version

function AboutContent() {
  return (
    <div className="info-content">
      <p className="info-tagline">Beautiful drones for practice and meditation.</p>

      <p className="info-body">
        Drune is a simple drone and metronome app for musicians. Choose a key, register, and
        sound, then let the drone bloom slowly into a warm, steady tone for practice, tuning, singing,
        improvisation, or meditation.
      </p>

      {APP_VERSION ? <p className="info-version">Version {APP_VERSION}</p> : null}

      <p className="info-note">
        Choose a Moon for the sound, then a Phase for its motion. Designed for
        focused listening. Headphones recommended for Binaural.
      </p>
    </div>
  )
}

function HelpContent() {
  return (
    <div className="info-content">
      <section className="info-section">
        <h3 className="info-section-title">Getting Started</h3>
        <ul className="info-list">
          <li>Choose a key.</li>
          <li>Choose a register.</li>
          <li>Choose a Moon (the sound).</li>
          <li>Choose a Phase (the motion) — or beat controls if the Moon is Binaural.</li>
          <li>Tap Play.</li>
          <li>The drone fades in gradually, so give it a few seconds to bloom.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Drone Controls</h3>
        <ul className="info-list">
          <li>Intensity is the main tonal control — warmth, brightness, focus, projection, and low-end balance.</li>
          <li>Breath adds slow movement to the sound.</li>
          <li>Master Volume controls output level.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Tuning</h3>
        <ul className="info-list">
          <li>The tuning stepper changes the reference pitch for A.</li>
          <li>Default is A = 440 Hz.</li>
          <li>Use lower settings for Baroque or warm practice contexts.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Moon &amp; Phase</h3>
        <ul className="info-list">
          <li>Moon is the drone voice — its sound world.</li>
          <li>Phase is the slow motion and emotional behavior of that Moon.</li>
          <li>Binaural is a special Moon for headphone beat listening; when it is
            selected, the beat controls replace the Phase menu.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Moons</h3>
        <ul className="info-list">
          <li>Mimas: {MOON_DESCRIPTIONS.Mimas}.</li>
          <li>Europa: {MOON_DESCRIPTIONS.Europa}.</li>
          <li>Titan: {MOON_DESCRIPTIONS.Titan}.</li>
          <li>Io: {MOON_DESCRIPTIONS.Io}.</li>
          <li>Binaural: {MOON_DESCRIPTIONS.Binaural}.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Phases</h3>
        <p className="info-body">
          Phases add very slow, evolving movement — felt after about a minute, never
          an obvious wobble. They do not change the metronome or output level.
        </p>
        <ul className="info-list">
          {MOODS.map((mood) => (
            <li key={mood.id}>{mood.name}: {mood.description}</li>
          ))}
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Metronome</h3>
        <ul className="info-list">
          <li>The metronome can run with or without the drone.</li>
          <li>Choose tempo, meter, and sound.</li>
          <li>Wood is clear and direct.</li>
          <li>Triangle has a ringing downbeat.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Binaural</h3>
        <ul className="info-list">
          <li>Use headphones.</li>
          <li>Binaural adds quiet left/right undertones for beat listening.</li>
          <li>Choose a beat frequency from the menu when Binaural is selected.</li>
          <li>Selecting Binaural replaces the Phase menu with these beat controls.</li>
          <li>Keep volume comfortable.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3 className="info-section-title">Troubleshooting</h3>
        <ul className="info-list">
          <li>If you do not hear sound, tap Play again and check your device volume.</li>
          <li>On iPhone, silent mode may affect audio.</li>
          <li>If audio behaves strangely after backgrounding the app, stop and start playback again.</li>
        </ul>
      </section>
    </div>
  )
}

export function InfoModal({ screen, onClose, onScreenChange }) {
  const closeButtonRef = useRef(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const titleId = screen === 'about' ? 'about-sheet-title' : 'help-sheet-title'

  return (
    <div className="info-overlay" onClick={onClose}>
      <div
        className="info-sheet card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-sheet-header">
          <div className="info-tabs" role="tablist" aria-label="Information sections">
            <button
              type="button"
              role="tab"
              id="about-tab"
              className={screen === 'about' ? 'info-tab selected' : 'info-tab'}
              aria-selected={screen === 'about'}
              aria-controls="about-panel"
              onClick={() => onScreenChange('about')}
            >
              About
            </button>
            <button
              type="button"
              role="tab"
              id="help-tab"
              className={screen === 'help' ? 'info-tab selected' : 'info-tab'}
              aria-selected={screen === 'help'}
              aria-controls="help-panel"
              onClick={() => onScreenChange('help')}
            >
              Help
            </button>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="info-close-button"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="info-sheet-body">
          {screen === 'about' ? (
            <div id="about-panel" role="tabpanel" aria-labelledby="about-tab">
              <h2 className="info-sheet-title" id="about-sheet-title">
                Drune
              </h2>
              <AboutContent />
            </div>
          ) : (
            <div id="help-panel" role="tabpanel" aria-labelledby="help-tab">
              <h2 className="info-sheet-title" id="help-sheet-title">
                Help
              </h2>
              <HelpContent />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
