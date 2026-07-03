import { useCallback, useEffect, useState } from 'react'
import * as Tone from 'tone'
import { droneEngine } from './droneEngine'
import {
  audioDiag,
  formatAudioDiagnosticsForCopy,
  getRecentAudioDiagnostics,
  subscribeAudioDiagnostics,
} from './audioDiagnostics'
import {
  configureNativePlaybackSession,
  getNativeSessionDebugState,
  testNativePlaybackBeep,
} from './nativeAudioSession'
import { ensurePrimerPlaying, getPrimerDebugState } from './iosMediaPrimer'
import {
  setNativeDroneBreath,
  setNativeDroneFrequency,
  setNativeDroneIntensity,
  setNativeDronePartials,
  setNativeDroneVolume,
  startNativeDrone,
  stopNativeDrone,
} from './nativeDroneExperiment'
import {
  applyNativeToneLabPreset,
  getNativeToneLabSettings,
  resetNativeToneLabSettings,
  setNativeToneLabSettings,
  subscribeNativeToneLab,
} from './nativeToneLab'
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

function formatSliderValue(value, isDb) {
  const n = Number(value)
  if (!Number.isFinite(n)) return isDb ? '0.0' : '0.00'
  return isDb ? n.toFixed(1) : n.toFixed(2)
}

function ToneLabSlider({ label, value, onChange, min = 0, max = 1, step = 0.01, isDb = false }) {
  return (
    <label className="audio-debug-slider-row">
      <div className="audio-debug-slider-header">
        <span className="audio-debug-slider-label">{label}</span>
        <span className="audio-debug-slider-value">{formatSliderValue(value, isDb)}</span>
      </div>
      <input
        type="range"
        className="audio-debug-slider"
        min={min}
        max={max}
        step={step}
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </label>
  )
}

function NativeToneLabControls() {
  const [settings, setSettings] = useState(getNativeToneLabSettings)

  useEffect(() => subscribeNativeToneLab(setSettings), [])

  const update = useCallback((key, value) => {
    setSettings(setNativeToneLabSettings({ [key]: value }))
  }, [])

  const applyPreset = useCallback((name) => {
    setSettings(applyNativeToneLabPreset(name))
  }, [])

  const handleReset = useCallback(() => {
    setSettings(resetNativeToneLabSettings())
  }, [])

  return (
    <details className="audio-debug-details" open>
      <summary className="audio-debug-details-summary">Native Tone Lab</summary>
      <p className="audio-debug-hint">
        Live organ-timbre experiment (Native Mode only). Changes persist in localStorage.
      </p>

      <div className="audio-debug-preset-row">
        <button type="button" className="audio-debug-preset-btn" onClick={handleReset}>
          Reset
        </button>
        <button type="button" className="audio-debug-preset-btn" onClick={() => applyPreset('off')}>
          Off
        </button>
        <button type="button" className="audio-debug-preset-btn" onClick={() => applyPreset('titanOrgan')}>
          Titan Organ
        </button>
        <button type="button" className="audio-debug-preset-btn" onClick={() => applyPreset('titanSoft')}>
          Titan Soft
        </button>
        <button type="button" className="audio-debug-preset-btn" onClick={() => applyPreset('cosmicGlow')}>
          Cosmic Glow
        </button>
      </div>

      <details className="audio-debug-details audio-debug-details-nested" open>
        <summary className="audio-debug-details-summary">Global Organ Tone</summary>
        <ToneLabSlider label="Organ amount" value={settings.organToneAmount} onChange={(v) => update('organToneAmount', v)} />
        <ToneLabSlider label="Organ brightness" value={settings.organToneBrightness} onChange={(v) => update('organToneBrightness', v)} />
        <ToneLabSlider label="Organ blend" value={settings.organToneBlend} onChange={(v) => update('organToneBlend', v)} />
        <ToneLabSlider label="Triangle body" value={settings.triangleBody} onChange={(v) => update('triangleBody', v)} />
        <ToneLabSlider label="Saw body" value={settings.sawBody} onChange={(v) => update('sawBody', v)} />
        <ToneLabSlider label="Formant body" value={settings.formantBody} onChange={(v) => update('formantBody', v)} />
        <ToneLabSlider
          label="Output trim (dB)"
          value={settings.outputTrimDb}
          onChange={(v) => update('outputTrimDb', v)}
          min={-6}
          max={6}
          step={0.1}
          isDb
        />
      </details>

      <details className="audio-debug-details audio-debug-details-nested" open>
        <summary className="audio-debug-details-summary">Moon Amounts</summary>
        <ToneLabSlider label="Pure organ" value={settings.pureOrgan} onChange={(v) => update('pureOrgan', v)} />
        <ToneLabSlider label="Shruti organ" value={settings.shrutiOrgan} onChange={(v) => update('shrutiOrgan', v)} />
        <ToneLabSlider label="Strings organ" value={settings.stringsOrgan} onChange={(v) => update('stringsOrgan', v)} />
        <ToneLabSlider label="Cosmos organ" value={settings.cosmosOrgan} onChange={(v) => update('cosmosOrgan', v)} />
        <ToneLabSlider label="Binaural organ" value={settings.binauralOrgan} onChange={(v) => update('binauralOrgan', v)} />
      </details>

      <details className="audio-debug-details audio-debug-details-nested">
        <summary className="audio-debug-details-summary">Moon Trims (dB)</summary>
        <ToneLabSlider label="Pure trim" value={settings.pureTrimDb} onChange={(v) => update('pureTrimDb', v)} min={-6} max={6} step={0.1} isDb />
        <ToneLabSlider label="Shruti trim" value={settings.shrutiTrimDb} onChange={(v) => update('shrutiTrimDb', v)} min={-6} max={6} step={0.1} isDb />
        <ToneLabSlider label="Strings trim" value={settings.stringsTrimDb} onChange={(v) => update('stringsTrimDb', v)} min={-6} max={6} step={0.1} isDb />
        <ToneLabSlider label="Cosmos trim" value={settings.cosmosTrimDb} onChange={(v) => update('cosmosTrimDb', v)} min={-6} max={6} step={0.1} isDb />
        <ToneLabSlider label="Binaural trim" value={settings.binauralTrimDb} onChange={(v) => update('binauralTrimDb', v)} min={-6} max={6} step={0.1} isDb />
      </details>
    </details>
  )
}

export function AudioDebugPanel({
  uiIsMetronomePlaying,
  nativeModeEnabled = false,
  nativeModeSupported = false,
  onToggleNativeMode,
}) {
  const [tick, setTick] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [tapCounter, setTapCounter] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [nativeTestMessage, setNativeTestMessage] = useState('')
  const [beepStatus, setBeepStatus] = useState(null)
  const [nativeBeepStatus, setNativeBeepStatus] = useState(null)
  const [webBeepPresetStatus, setWebBeepPresetStatus] = useState(null)
  const [primerBeepStatus, setPrimerBeepStatus] = useState(null)
  const [nativeDroneStatus, setNativeDroneStatus] = useState(null)
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
    const toneLab = getNativeToneLabSettings()
    const text = [
      '=== Moondrone iOS audio debug ===',
      `uiIsMetronomePlaying: ${uiIsMetronomePlaying}`,
      `nativeModeEnabled: ${nativeModeEnabled}`,
      `engine: ${formatJson(engineSnapshot)}`,
      `native: ${formatJson(nativeDebug)}`,
      `nativeToneLab: ${formatJson(toneLab)}`,
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

  async function handleTestNativeBeep(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'TEST NATIVE BEEP pressed')
    setNativeBeepStatus({ pending: true })

    const result = await testNativePlaybackBeep()
    setNativeBeepStatus(result)
    refresh()
  }

  async function handleTestWebBeepNativePreset(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'web beep native preset pressed')

    const status = {
      nativeBefore: null,
      contextBefore: getContextState(),
      contextAfter: null,
      beepStarted: false,
      beepStopped: false,
      nativeAfter: null,
      error: null,
    }
    setWebBeepPresetStatus({ ...status })

    try {
      const nativeBefore = await configureNativePlaybackSession('web-beep-before-tone')
      status.nativeBefore = nativeBefore
        ? { category: nativeBefore.category, mode: nativeBefore.mode, outputVolume: nativeBefore.outputVolume }
        : null
      setWebBeepPresetStatus({ ...status })

      await Tone.start()
      status.contextAfter = getContextState()
      setWebBeepPresetStatus({ ...status })

      const osc = new Tone.Oscillator({ frequency: 660, type: 'sine' }).toDestination()
      osc.start()
      status.beepStarted = true
      setWebBeepPresetStatus({ ...status })
      audioDiag('debug-panel', 'web beep native preset — beep started', {
        contextAfter: status.contextAfter,
      })

      window.setTimeout(() => {
        try {
          osc.stop()
          osc.dispose()
          status.beepStopped = true
          setWebBeepPresetStatus({ ...status })
          audioDiag('debug-panel', 'web beep native preset — beep stopped')
        } catch (stopError) {
          status.error = stopError?.message ?? String(stopError)
          setWebBeepPresetStatus({ ...status })
        }
      }, 350)

      const nativeAfter = await configureNativePlaybackSession('web-beep-after-tone')
      status.nativeAfter = nativeAfter
        ? { category: nativeAfter.category, mode: nativeAfter.mode, outputVolume: nativeAfter.outputVolume }
        : null
      setWebBeepPresetStatus({ ...status })
      refresh()
    } catch (error) {
      status.error = error?.message ?? String(error)
      setWebBeepPresetStatus({ ...status })
      audioDiag('debug-panel', 'web beep native preset error', { message: status.error })
    }
  }

  async function handleTestMediaPrimerWebBeep(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'TEST MEDIA PRIMER + WEB BEEP pressed')

    const status = {
      nativeBefore: null,
      primer: null,
      contextBefore: getContextState(),
      contextAfter: null,
      beepStarted: false,
      beepStopped: false,
      nativeAfter: null,
      error: null,
    }
    setPrimerBeepStatus({ ...status })

    try {
      const nativeBefore = await configureNativePlaybackSession('primer-beep-before')
      status.nativeBefore = nativeBefore
        ? { category: nativeBefore.category, mode: nativeBefore.mode, outputVolume: nativeBefore.outputVolume }
        : null
      setPrimerBeepStatus({ ...status })

      await ensurePrimerPlaying('primer-beep-test')
      status.primer = getPrimerDebugState()
      setPrimerBeepStatus({ ...status })

      await Tone.start()
      status.contextAfter = getContextState()
      setPrimerBeepStatus({ ...status })

      const osc = new Tone.Oscillator({ frequency: 740, type: 'sine' }).toDestination()
      osc.start()
      status.beepStarted = true
      setPrimerBeepStatus({ ...status })
      audioDiag('debug-panel', 'primer+beep — beep started', { contextAfter: status.contextAfter })

      window.setTimeout(() => {
        try {
          osc.stop()
          osc.dispose()
          status.beepStopped = true
          status.primer = getPrimerDebugState()
          setPrimerBeepStatus({ ...status })
          audioDiag('debug-panel', 'primer+beep — beep stopped', { primer: status.primer })
        } catch (stopError) {
          status.error = stopError?.message ?? String(stopError)
          setPrimerBeepStatus({ ...status })
        }
      }, 400)

      const nativeAfter = await configureNativePlaybackSession('primer-beep-after')
      status.nativeAfter = nativeAfter
        ? { category: nativeAfter.category, mode: nativeAfter.mode, outputVolume: nativeAfter.outputVolume }
        : null
      setPrimerBeepStatus({ ...status })
      refresh()
    } catch (error) {
      status.error = error?.message ?? String(error)
      setPrimerBeepStatus({ ...status })
      audioDiag('debug-panel', 'primer+beep error', { message: status.error })
    }
  }

  async function handleStartNativeDrone(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'NATIVE DRONE START pressed')
    setNativeDroneStatus({ pending: true, action: 'start' })
    try {
      const result = await startNativeDrone(0.2)
      setNativeDroneStatus({ ...result, action: 'start' })
    } catch (error) {
      setNativeDroneStatus({ action: 'start', error: error?.message ?? String(error) })
    }
    refresh()
  }

  async function handleStopNativeDrone(event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'NATIVE DRONE STOP pressed')
    try {
      const result = await stopNativeDrone()
      setNativeDroneStatus({ ...result, action: 'stop' })
    } catch (error) {
      setNativeDroneStatus({ action: 'stop', error: error?.message ?? String(error) })
    }
    refresh()
  }

  async function handleNativeDroneVolume(value, event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', 'NATIVE DRONE VOLUME pressed', { value })
    try {
      const result = await setNativeDroneVolume(value)
      setNativeDroneStatus((prev) => ({ ...(prev ?? {}), ...result, action: 'volume' }))
    } catch (error) {
      setNativeDroneStatus({ action: 'volume', error: error?.message ?? String(error) })
    }
    refresh()
  }

  async function handleNativeDroneParam(label, fn, arg, event) {
    event.preventDefault()
    event.stopPropagation()
    audioDiag('debug-panel', `NATIVE DRONE ${label} pressed`, { arg })
    try {
      const result = await fn(arg)
      setNativeDroneStatus((prev) => ({ ...(prev ?? {}), ...result, action: label }))
    } catch (error) {
      setNativeDroneStatus({ action: label, error: error?.message ?? String(error) })
    }
    refresh()
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

      <div className="audio-debug-block">
        <div className="audio-debug-label">
          Native iOS Engine mode {nativeModeSupported ? '' : '(native platform only)'}
        </div>
        <button
          type="button"
          className={`audio-debug-action ${nativeModeEnabled ? 'audio-debug-bad' : ''}`}
          style={{ touchAction: 'manipulation' }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleNativeMode?.()
          }}
        >
          {nativeModeEnabled ? 'NATIVE MODE: ON → Tone.js' : 'NATIVE MODE: OFF → Native'}
        </button>
        <p className="audio-debug-value">
          {nativeModeEnabled
            ? 'UI Play/key/intensity/breath/volume/preset drive the native Swift engine.'
            : 'UI drives the Tone.js engine (default).'}
        </p>
      </div>

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

      <details className="audio-debug-details">
        <summary className="audio-debug-details-summary">Native session snapshot</summary>
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
      </details>

      {nativeModeEnabled ? (
        <NativeToneLabControls />
      ) : (
        <p className="audio-debug-hint">Enable Native Mode to show Native Tone Lab sliders.</p>
      )}

      <details className="audio-debug-details">
        <summary className="audio-debug-details-summary">Legacy tests</summary>
        <p className="audio-debug-hint">Old WebAudio / POC buttons kept for troubleshooting only.</p>

        {beepStatus ? (
          <div className="audio-debug-block">
            <div className="audio-debug-label">Raw web beep test</div>
            <pre className="audio-debug-pre">{formatJson(beepStatus)}</pre>
          </div>
        ) : null}

        {nativeBeepStatus ? (
          <div className="audio-debug-block">
            <div className="audio-debug-label">Native beep test (AVAudioEngine)</div>
            <pre className={`audio-debug-pre ${nativeBeepStatus.error ? 'audio-debug-bad' : ''}`}>
              {formatJson(nativeBeepStatus)}
            </pre>
          </div>
        ) : null}

        {webBeepPresetStatus ? (
          <div className="audio-debug-block">
            <div className="audio-debug-label">Web beep w/ native preset</div>
            <pre className={`audio-debug-pre ${webBeepPresetStatus.error ? 'audio-debug-bad' : ''}`}>
              {formatJson(webBeepPresetStatus)}
            </pre>
          </div>
        ) : null}

        {primerBeepStatus ? (
          <div className="audio-debug-block">
            <div className="audio-debug-label">Media primer + web beep</div>
            <pre className={`audio-debug-pre ${primerBeepStatus.error ? 'audio-debug-bad' : ''}`}>
              {formatJson(primerBeepStatus)}
            </pre>
          </div>
        ) : null}

        {nativeDroneStatus ? (
          <div className="audio-debug-block">
            <div className="audio-debug-label">Native drone POC (AVAudioSourceNode)</div>
            <pre className={`audio-debug-pre ${nativeDroneStatus.error ? 'audio-debug-bad' : ''}`}>
              {formatJson(nativeDroneStatus)}
            </pre>
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
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleTestNativeBeep}
          >
            TEST NATIVE BEEP
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleTestWebBeepNativePreset}
          >
            TEST WEB BEEP WITH NATIVE PRESET
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleTestMediaPrimerWebBeep}
          >
            TEST MEDIA PRIMER + WEB BEEP
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleStartNativeDrone}
          >
            START NATIVE DRONE (POC)
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleStopNativeDrone}
          >
            STOP NATIVE DRONE (POC)
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneVolume(0.05, event)}
          >
            NATIVE DRONE VOL 0.05
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneVolume(0.3, event)}
          >
            NATIVE DRONE VOL 0.3
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('freq A2', setNativeDroneFrequency, 110, event)}
          >
            NATIVE DRONE FREQ A2 (110)
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('freq D3', setNativeDroneFrequency, 146.83, event)}
          >
            NATIVE DRONE FREQ D3 (146.8)
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('breath 0', setNativeDroneBreath, 0, event)}
          >
            NATIVE DRONE BREATH 0
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('breath 0.7', setNativeDroneBreath, 0.7, event)}
          >
            NATIVE DRONE BREATH 0.7
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('intensity 0.2', setNativeDroneIntensity, 0.2, event)}
          >
            NATIVE DRONE INTENSITY 0.2
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('intensity 0.95', setNativeDroneIntensity, 0.95, event)}
          >
            NATIVE DRONE INTENSITY 0.95
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) => handleNativeDroneParam('preset R+5+8', setNativeDronePartials, undefined, event)}
          >
            NATIVE DRONE PRESET (R+5+8)
          </button>
          <button
            type="button"
            className="audio-debug-action"
            style={{ touchAction: 'manipulation' }}
            onPointerDown={(event) =>
              handleNativeDroneParam(
                'partials root+oct',
                setNativeDronePartials,
                [
                  { ratio: 1, gain: 0.6 },
                  { ratio: 2, gain: 0.25 },
                ],
                event,
              )
            }
          >
            NATIVE DRONE PARTIALS (ROOT+OCT)
          </button>
        </div>
      </details>

      <details className="audio-debug-details" open>
        <summary className="audio-debug-details-summary">Event log (tick {tick})</summary>
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
      </details>
    </section>
  )
}
