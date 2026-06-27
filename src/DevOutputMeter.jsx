import { useEffect, useRef, useState } from 'react'
import { droneEngine } from './droneEngine'
import './DevOutputMeter.css'

const VISIBILITY_STORAGE_KEY = 'moondrone.devMeter.visible'
const DISPLAY_INTERVAL_MS = 250
const PEAK_HOLD_DECAY_SECONDS = 2
const LEVEL_MIN_DB = -48
const LEVEL_MAX_DB = 0
const SPECTRUM_MIN_DB = -90
const SPECTRUM_MAX_DB = -12
const DEV_GAIN_MIN = -6
const DEV_GAIN_MAX = 6
const DEV_GAIN_STEP = 0.5

function readStoredVisible() {
  try {
    return window.sessionStorage.getItem(VISIBILITY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredVisible(visible) {
  try {
    window.sessionStorage.setItem(VISIBILITY_STORAGE_KEY, visible ? '1' : '0')
  } catch {
    // sessionStorage may be unavailable.
  }
}

function formatDb(value) {
  if (!Number.isFinite(value)) {
    return '−∞'
  }

  if (value > 0) {
    return `+${value.toFixed(1)}`
  }

  return value.toFixed(1)
}

function formatSignedDb(value) {
  if (!Number.isFinite(value)) {
    return '−∞'
  }

  if (value > 0) {
    return `+${value.toFixed(1)} dB`
  }

  return `${value.toFixed(1)} dB`
}

function dbToLevelPercent(db, minDb = LEVEL_MIN_DB, maxDb = LEVEL_MAX_DB) {
  if (!Number.isFinite(db)) {
    return 0
  }

  return Math.max(0, Math.min(100, ((db - minDb) / (maxDb - minDb)) * 100))
}

function dbToSpectrumHeight(db, minDb = SPECTRUM_MIN_DB, maxDb = SPECTRUM_MAX_DB) {
  if (!Number.isFinite(db)) {
    return 0
  }

  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)))
}

function clipLabel(displayPeakDb) {
  if (!Number.isFinite(displayPeakDb)) {
    return { text: 'Idle', className: 'dev-output-meter-clip--ok' }
  }

  if (displayPeakDb >= -0.5) {
    return { text: 'CLIP', className: 'dev-output-meter-clip--clip' }
  }

  if (displayPeakDb >= -3) {
    return { text: 'Near clip', className: 'dev-output-meter-clip--near' }
  }

  return { text: 'OK', className: 'dev-output-meter-clip--ok' }
}

function getCanvasSize(canvas) {
  const width = Math.max(canvas.clientWidth || 0, canvas.width || 0, 184)
  const height = Math.max(canvas.clientHeight || 0, canvas.height || 0, 48)

  return { width, height }
}

function drawSpectrum(canvas, fft) {
  if (!canvas) {
    return { drewBars: false, reason: 'no-canvas' }
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return { drewBars: false, reason: 'no-context' }
  }

  const { width, height } = getCanvasSize(canvas)
  const pixelRatio = window.devicePixelRatio || 1

  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  context.clearRect(0, 0, width, height)
  context.fillStyle = 'rgba(0, 0, 0, 0.5)'
  context.fillRect(0, 0, width, height)

  if (!fft?.length) {
    return { drewBars: false, reason: 'no-fft' }
  }

  const barCount = 40
  const usableBins = Math.max(1, fft.length - 1)
  const step = Math.max(1, Math.floor(usableBins / barCount))
  const barWidth = width / barCount
  let drewBars = false

  for (let index = 0; index < barCount; index += 1) {
    const binIndex = 1 + index * step
    const db = fft[binIndex]

    if (!Number.isFinite(db)) {
      continue
    }

    const normalized = dbToSpectrumHeight(db)
    const barHeight = Math.max(2, normalized * (height - 4))

    if (normalized > 0.02) {
      drewBars = true
    }

    const x = index * barWidth
    const y = height - barHeight - 1

    context.fillStyle = normalized > 0.82
      ? 'rgba(255, 123, 107, 0.98)'
      : normalized > 0.55
        ? 'rgba(244, 191, 127, 0.96)'
        : 'rgba(143, 174, 138, 0.94)'
    context.fillRect(x + 0.5, y, Math.max(1.5, barWidth - 1), barHeight)
  }

  context.strokeStyle = 'rgba(244, 191, 127, 0.22)'
  context.strokeRect(0.5, 0.5, width - 1, height - 1)

  return { drewBars, reason: drewBars ? null : 'silent-fft' }
}

function smoothValue(previous, next, alpha) {
  if (!Number.isFinite(next)) {
    return previous
  }

  if (!Number.isFinite(previous)) {
    return next
  }

  return previous + (next - previous) * alpha
}

function updatePeakHold(holdDb, nextPeakDb, deltaSeconds) {
  if (!Number.isFinite(nextPeakDb)) {
    return holdDb
  }

  if (!Number.isFinite(holdDb) || nextPeakDb >= holdDb) {
    return nextPeakDb
  }

  const alpha = 1 - Math.exp(-deltaSeconds / PEAK_HOLD_DECAY_SECONDS)

  return holdDb + (nextPeakDb - holdDb) * alpha
}

function resolveSpectrumStatus(snapshot, canvas) {
  if (!snapshot) {
    return 'unavailable'
  }

  if (!snapshot.analyserAvailable) {
    return 'unavailable'
  }

  if (!snapshot.fft?.length) {
    return 'waiting'
  }

  const drawResult = drawSpectrum(canvas, snapshot.fft)

  return drawResult.drewBars ? 'live' : 'waiting'
}

function LevelBar({ label, fillPercent, markerPercent, fillClassName }) {
  return (
    <div className="dev-output-meter-bar-block">
      <div className="dev-output-meter-bar-label">{label}</div>
      <div className="dev-output-meter-level" aria-hidden="true">
        <div
          className={`dev-output-meter-level-fill ${fillClassName}`}
          style={{ width: `${fillPercent}%` }}
        />
        {typeof markerPercent === 'number' ? (
          <div
            className="dev-output-meter-level-hold"
            style={{ left: `${markerPercent}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

export function DevOutputMeter() {
  const [visible, setVisible] = useState(readStoredVisible)
  const [devGainDb, setDevGainDb] = useState(0)
  const [display, setDisplay] = useState({
    peakDb: null,
    peakHoldDb: null,
    rmsDb: null,
    peakPercent: 0,
    peakHoldPercent: 0,
    rmsPercent: 0,
    productionTrimDb: 0,
    effectiveTotalDb: 0,
    spectrumStatus: 'waiting',
  })

  const canvasRef = useRef(null)
  const smoothRef = useRef({ peakDb: null, rmsDb: null })
  const peakHoldRef = useRef(null)
  const lastTickRef = useRef(0)

  useEffect(() => {
    writeStoredVisible(visible)
  }, [visible])

  useEffect(() => {
    droneEngine.setDevOutputGainDb?.(devGainDb)
  }, [devGainDb])

  useEffect(() => {
    if (!visible) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      const now = performance.now()
      const deltaSeconds = lastTickRef.current
        ? Math.max(0.001, (now - lastTickRef.current) / 1000)
        : DISPLAY_INTERVAL_MS / 1000
      lastTickRef.current = now

      const snapshot = droneEngine.getDevOutputMeterSnapshot?.() ?? null
      const rawPeakDb = snapshot?.peakDb ?? null
      const rawRmsDb = snapshot?.rmsDb ?? null

      smoothRef.current.peakDb = smoothValue(smoothRef.current.peakDb, rawPeakDb, 0.65)
      smoothRef.current.rmsDb = smoothValue(smoothRef.current.rmsDb, rawRmsDb, 0.12)

      peakHoldRef.current = updatePeakHold(
        peakHoldRef.current,
        rawPeakDb ?? smoothRef.current.peakDb,
        deltaSeconds,
      )

      const peakDb = smoothRef.current.peakDb
      const rmsDb = smoothRef.current.rmsDb
      const peakHoldDb = peakHoldRef.current
      const spectrumStatus = resolveSpectrumStatus(snapshot, canvasRef.current)

      setDisplay({
        peakDb,
        peakHoldDb,
        rmsDb,
        peakPercent: dbToLevelPercent(peakDb),
        peakHoldPercent: dbToLevelPercent(peakHoldDb),
        rmsPercent: dbToLevelPercent(rmsDb),
        productionTrimDb: snapshot?.productionTrimDb ?? 0,
        effectiveTotalDb: snapshot?.effectiveTotalDb ?? snapshot?.productionTrimDb ?? 0,
        spectrumStatus,
      })
    }, DISPLAY_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      lastTickRef.current = 0
      smoothRef.current = { peakDb: null, rmsDb: null }
      peakHoldRef.current = null
    }
  }, [visible])

  const clip = clipLabel(display.peakDb)

  return (
    <div className="dev-output-meter-root">
      <button
        type="button"
        className="dev-output-meter-toggle"
        aria-pressed={visible}
        aria-label={visible ? 'Hide dev output meter' : 'Show dev output meter'}
        onClick={() => setVisible((current) => !current)}
      >
        Meter
      </button>

      {visible ? (
        <div className="dev-output-meter-panel" role="region" aria-label="Dev output calibration meter">
          <div className="dev-output-meter-section-title">Output gain</div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">Prod trim</span>
            <span className="dev-output-meter-value">{formatSignedDb(display.productionTrimDb)}</span>
          </div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">Dev gain</span>
            <span className="dev-output-meter-value">{formatSignedDb(devGainDb)}</span>
          </div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">Effective</span>
            <span className="dev-output-meter-value">{formatSignedDb(display.effectiveTotalDb)}</span>
          </div>

          <label className="dev-output-meter-gain-control">
            <span className="dev-output-meter-label">Dev output gain</span>
            <input
              type="range"
              min={DEV_GAIN_MIN}
              max={DEV_GAIN_MAX}
              step={DEV_GAIN_STEP}
              value={devGainDb}
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value)
                setDevGainDb(next)
              }}
            />
            <span className="dev-output-meter-value">{formatSignedDb(devGainDb)}</span>
          </label>

          <div className="dev-output-meter-section-title">Levels</div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">Peak</span>
            <span className="dev-output-meter-value">{formatDb(display.peakDb)} dB</span>
          </div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">Hold</span>
            <span className="dev-output-meter-value">{formatDb(display.peakHoldDb)} dB</span>
          </div>
          <div className="dev-output-meter-row">
            <span className="dev-output-meter-label">RMS</span>
            <span className="dev-output-meter-value">{formatDb(display.rmsDb)} dB</span>
          </div>

          <LevelBar
            label="Peak"
            fillPercent={display.peakPercent}
            markerPercent={display.peakHoldPercent}
            fillClassName="dev-output-meter-level-fill--peak"
          />
          <LevelBar
            label="RMS"
            fillPercent={display.rmsPercent}
            fillClassName="dev-output-meter-level-fill--rms"
          />

          <div className={`dev-output-meter-clip ${clip.className}`}>{clip.text}</div>

          <div className="dev-output-meter-section-title">Spectrum</div>
          <canvas
            ref={canvasRef}
            className="dev-output-meter-canvas"
            width={184}
            height={48}
            aria-hidden="true"
          />

          {display.spectrumStatus !== 'live' ? (
            <div className="dev-output-meter-spectrum-fallback">
              {display.spectrumStatus === 'unavailable'
                ? 'Spectrum unavailable — press Play to start audio first.'
                : 'Spectrum waiting for signal…'}
            </div>
          ) : null}

          <div className="dev-output-meter-hint">Dev-only calibration tap · 4 updates/s</div>
        </div>
      ) : null}
    </div>
  )
}

export default DevOutputMeter
