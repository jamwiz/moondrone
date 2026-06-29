import { useCallback, useEffect, useState } from 'react'
import * as Tone from 'tone'
import { droneEngine } from './droneEngine'
import {
  audioDiag,
  formatAudioDiagnosticsForCopy,
  getRecentAudioDiagnostics,
  subscribeAudioDiagnostics,
} from './audioDiagnostics'
import { configureNativePlaybackSession, getNativeSessionDebugState } from './nativeAudioSession'
import './AudioDebugPanel.css'

function formatJson(value) {
  if (value == null) {
    return '—'
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getContextState() {
  try {
    return Tone.getContext()?.rawContext?.state ?? 'unknown'
  } catch {
    return 'error'
  }
}

function getEngineSnapshot() {
  const diag = droneEngine.getMetronomeDiagnostics?.() ?? {}
  return {
    contextState: getContextState(),
    metronomePlaying: diag.metronomePlaying ?? false,
    isReady: diag.isReady ?? false,
    isStarting: diag.isStarting ?? false,
    metronomeChainReady: diag.metronomeChainReady ?? 'unknown',
    metronomeChainReadyTruthy: diag.metronomeChainReadyTruthy ?? false,
  }
}

export function AudioDebugPanel({ uiIsMetronomePlaying }) {
  const [tick, setTick] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [tapCounter, setTapCounter] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [nativeTestMessage, setNativeTestMessage] = useState('')
  const [beepStatus, setBeepStatus] = useState(null)
  const [engineSnapshot, setEngineSnapshot] = useState(getEngineSnapshot)

  const refresh = useCallback(() => {
    setTick((value) => value + 1)
    setEngineSnapshot(getEngineSnapshot())
  }, [])

  useEffect(() => subscribeAudioDiagnostics(refresh), [refresh])

  useEffect(() => {
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const recentEvents = getRecentAudioDiagnostics(20)
  const nativeDebug = getNativeSessionDebugState()
  const registrationLabel = nativeDebug.registrationStatus

  const nativeLooksBroken =
    registrationLabel === 'unimplemented' ||
    registrationLabel === 'no-state' ||
    registrationLabel === 'failed' ||
    nativeDebug.lastError?.looksUnimplemented === true

  async function handleCopyLog() {
    const text = [
      '=== Moondrone iOS audio debug ===',
      `uiIsMetronomePlaying: ${uiIsMetronomePlaying}`,
      `engine: ${formatJson(engineSnapshot)}`,
      `native: ${formatJson(nativeDebug)}`,
      `beep: ${formatJson(beepStatus)}`,
      `tapCounter: ${tapCounter}`,
      '',
      '--- events ---',
      formatAudioDiagnosticsForCopy(getRecentAudioDiagnostics(200)),
    ].join('\n')

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopyStatus('Copied')
      window.setTimeout(() => setCopyStatus(''), 2000)
    } catch (error) {
      setCopyStatus(`Copy failed: ${error?.message ?? error}`)
    }
  }

  function handleTestTapVisible(event) {
    event.preventDefault()
    event.stopPropagation()
    setTapCounter((count) => count + 1)
    audioDiag('debug-panel', 'TEST TAP VISIBLE pressed', { tapCounter: tapCounter + 1 })
  }

  async function handleTestNativeSession(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'TEST NATIVE SESSION pressed')
    setNativeTestMessage('Calling native…')

    const result = await configureNativePlaybackSession('manual-test')
    const updated = getNativeSessionDebugState()
    refresh()

    if (result?.category) {
      setNativeTestMessage(`OK category=${result.category} mode=${result.mode} vol=${result.outputVolume}`)
      audioDiag('debug-panel', 'TEST NATIVE SESSION result', result)
      return
    }

    if (updated.registrationStatus === 'unimplemented' || updated.lastError?.looksUnimplemented) {
      setNativeTestMessage('MoondroneAudio native plugin NOT registered / call failed')
    } else if (updated.registrationStatus === 'no-state') {
      setNativeTestMessage('MoondroneAudio native plugin NOT registered / call failed (no state returned)')
    } else {
      setNativeTestMessage(
        `MoondroneAudio native plugin NOT registered / call failed (${updated.lastError?.message ?? 'unknown'})`,
      )
    }
    audioDiag('debug-panel', 'TEST NATIVE SESSION failed', updated)
  }

  async function handleTestRawBeep(event) {
    event.preventDefault()
    event.stopPropagation()

    const before = getContextState()
    setBeepStatus({ before, after: null, beepStarted: false, beepStopped: false, error: null })
    audioDiag('debug-panel', 'TEST RAW WEB AUDIO BEEP pressed', { contextBefore: before })

    try {
      await Tone.start()
      const after = getContextState()
      setBeepStatus((prev) => ({ ...prev, after }))

      const osc = new Tone.Oscillator({ frequency: 880, type: 'sine' }).toDestination()
      osc.start()
      setBeepStatus((prev) => ({ ...prev, beepStarted: true }))
      audioDiag('debug-panel', 'TEST RAW WEB AUDIO BEEP started', { contextAfter: after })

      window.setTimeout(() => {
        try {
          osc.stop()
          osc.dispose()
          setBeepStatus((prev) => ({ ...prev, beepStopped: true }))
          audioDiag('debug-panel', 'TEST RAW WEB AUDIO BEEP stopped')
        } catch (stopError) {
          setBeepStatus((prev) => ({
            ...prev,
            error: stopError?.message ?? String(stopError),
          }))
        }
      }, 350)

      void configureNativePlaybackSession('beep-post-context').then((state) => {
        audioDiag('debug-panel', 'TEST RAW WEB AUDIO BEEP post-native session', state)
        refresh()
      })
    } catch (error) {
      const message = error?.message ?? String(error)
      setBeepStatus((prev) => ({ ...prev, error: message }))
      audioDiag('debug-panel', 'TEST RAW WEB AUDIO BEEP error', { message })
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="audio-debug-panel-toggle"
        onClick={() => setCollapsed(false)}
        aria-label="Show audio debug panel"
      >
        DBG
      </button>
    )
  }

  return (
    <section className="audio-debug-panel" aria-label="Temporary iOS audio debug">
      <header className="audio-debug-panel-header">
        <strong>iOS audio debug (temp)</strong>
        <div className="audio-debug-panel-header-actions">
          <button type="button" className="audio-debug-mini-button" onClick={handleCopyLog}>
            Copy debug log
          </button>
          <button type="button" className="audio-debug-mini-button" onClick={() => setCollapsed(true)}>
            Hide
          </button>
        </div>
      </header>

      {copyStatus ? <p className="audio-debug-copy-status">{copyStatus}</p> : null}

      <div className="audio-debug-grid">
        <div>
          <div className="audio-debug-label">AudioContext state</div>
          <div className="audio-debug-value">{engineSnapshot.contextState}</div>
        </div>
        <div>
          <div className="audio-debug-label">MoondroneAudio registration</div>
          <div className={`audio-debug-value ${nativeLooksBroken ? 'audio-debug-bad' : ''}`}>
            {registrationLabel}
          </div>
        </div>
        <div>
          <div className="audio-debug-label">UI isMetronomePlaying</div>
          <div className="audio-debug-value">{String(uiIsMetronomePlaying)}</div>
        </div>
        <div>
          <div className="audio-debug-label">engine metronomePlaying</div>
          <div className="audio-debug-value">{String(engineSnapshot.metronomePlaying)}</div>
        </div>
        <div>
          <div className="audio-debug-label">isReady / isStarting</div>
          <div className="audio-debug-value">
            {String(engineSnapshot.isReady)} / {String(engineSnapshot.isStarting)}
          </div>
        </div>
        <div>
          <div className="audio-debug-label">metronomeChainReady</div>
          <div className="audio-debug-value">
            {String(engineSnapshot.metronomeChainReady)} (truthy: {String(engineSnapshot.metronomeChainReadyTruthy)})
          </div>
        </div>
      </div>

      <div className="audio-debug-block">
        <div className="audio-debug-label">Last native session result</div>
        <pre className="audio-debug-pre">{formatJson(nativeDebug.lastResult)}</pre>
      </div>

      <div className="audio-debug-block">
        <div className="audio-debug-label">Last native session error</div>
        <pre className={`audio-debug-pre ${nativeDebug.lastError ? 'audio-debug-bad' : ''}`}>
          {formatJson(nativeDebug.lastError)}
        </pre>
      </div>

      {nativeTestMessage ? (
        <p className={`audio-debug-banner ${nativeLooksBroken ? 'audio-debug-bad' : ''}`}>{nativeTestMessage}</p>
      ) : null}

      {beepStatus ? (
        <div className="audio-debug-block">
          <div className="audio-debug-label">Raw beep test</div>
          <pre className="audio-debug-pre">{formatJson(beepStatus)}</pre>
        </div>
      ) : null}

      <div className="audio-debug-buttons">
        <button
          type="button"
          className="audio-debug-action"
          style={{ touchAction: 'manipulation' }}
          onPointerDown={handleTestTapVisible}
        >
          TEST TAP VISIBLE ({tapCounter})
        </button>
        <button
          type="button"
          className="audio-debug-action"
          style={{ touchAction: 'manipulation' }}
          onPointerDown={handleTestNativeSession}
        >
          TEST NATIVE SESSION
        </button>
        <button
          type="button"
          className="audio-debug-action"
          style={{ touchAction: 'manipulation' }}
          onPointerDown={handleTestRawBeep}
        >
          TEST RAW WEB AUDIO BEEP
        </button>
      </div>

      <div className="audio-debug-block">
        <div className="audio-debug-label">Last 20 events (tick {tick})</div>
        <pre className="audio-debug-events">
          {recentEvents.length === 0
            ? '(no events yet)'
            : recentEvents
                .map((entry) => {
                  const details =
                    entry.details == null
                      ? ''
                      : ` ${typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)}`
                  return `${entry.t.slice(11, 19)} [${entry.scope}] ${entry.message}${details}`
                })
                .join('\n')}
        </pre>
      </div>
    </section>
  )
}
