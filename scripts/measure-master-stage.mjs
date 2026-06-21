/**
 * Offline master-stage diagnostic for Shruti / Medium / Intensity 70 / Volume 100%.
 * Renders ~10 s of steady drone audio and samples stage meters during the render.
 *
 * Usage:
 *   npm run measure:master
 *   npx vite-node scripts/measure-master-stage.mjs --no-saturation
 *   npx vite-node scripts/measure-master-stage.mjs --both
 */

import 'node-web-audio-api/polyfill.js'

// node-web-audio-api sets window = {} — engine breath/mood loops need these.
if (!globalThis.window?.performance) {
  globalThis.window.performance = globalThis.performance
}
if (!globalThis.window.requestAnimationFrame) {
  globalThis.window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16)
  globalThis.window.cancelAnimationFrame = (id) => clearTimeout(id)
}

const Tone = await import('tone')
const { DroneEngine } = await import('../src/droneEngine.js')
const { MASTER_TUNING, TRANSITION_TUNING } = await import('../src/soundTuning.js')
const { DEFAULT_PRESET } = await import('../src/presets.js')

const RENDER_SECONDS = 10
const SAMPLE_TIME_SECONDS = 9
const TAIL_ANALYSIS_SECONDS = 3
const FIXED_REVERB_PERCENT = 20

function parseArgs(argv) {
  if (argv.includes('--both')) {
    return { mode: 'both' }
  }
  if (argv.includes('--no-saturation')) {
    return { mode: 'no-saturation' }
  }
  return { mode: 'with-saturation' }
}

function analyzeTail(buffer, tailSeconds = TAIL_ANALYSIS_SECONDS) {
  const sampleRate = buffer.sampleRate
  const channels = buffer.numberOfChannels
  const end = buffer.length
  const start = Math.max(0, end - Math.floor(tailSeconds * sampleRate))
  const frameCount = end - start

  let sumSquares = 0
  let peak = 0
  let clipFrames = 0

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = start; index < end; index += 1) {
      const sample = data[index]
      const magnitude = Math.abs(sample)
      sumSquares += sample * sample
      peak = Math.max(peak, magnitude)
      if (magnitude >= 0.99) {
        clipFrames += 1
      }
    }
  }

  const totalSamples = frameCount * channels
  const rms = Math.sqrt(sumSquares / totalSamples)
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12))
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-12))
  const crestDb = peakDb - rmsDb
  const clipPercent = (clipFrames / frameCount) * 100

  return {
    tailSeconds,
    rmsDb,
    peakDb,
    crestDb,
    clipPercent,
    clipFrames,
  }
}

function goertzelMagnitude(data, sampleRate, frequency) {
  const omega = (2 * Math.PI * frequency) / sampleRate
  const cosine = Math.cos(omega)
  const sine = Math.sin(omega)
  const coeff = 2 * cosine
  let q0 = 0
  let q1 = 0
  let q2 = 0

  for (let index = 0; index < data.length; index += 1) {
    q0 = coeff * q1 - q2 + data[index]
    q2 = q1
    q1 = q0
  }

  const real = q1 - q2 * cosine
  const imag = q2 * sine
  return Math.sqrt(real * real + imag * imag) / data.length
}

function analyzeHarmonics(buffer, tailSeconds = TAIL_ANALYSIS_SECONDS) {
  const sampleRate = buffer.sampleRate
  const end = buffer.length
  const start = Math.max(0, end - Math.floor(tailSeconds * sampleRate))
  const left = buffer.getChannelData(0).slice(start, end)
  const fundamentalHz = 130.81 // Shruti Medium C — root C3

  const fundamental = goertzelMagnitude(left, sampleRate, fundamentalHz)
  const harmonics = [2, 3, 4, 5, 6].map((multiple) => (
    goertzelMagnitude(left, sampleRate, fundamentalHz * multiple)
  ))
  const harmonicEnergy = harmonics.reduce((sum, value) => sum + value * value, 0)
  const fundamentalEnergy = fundamental * fundamental
  const harmonicRatioDb = 10 * Math.log10(Math.max(harmonicEnergy, 1e-18) / Math.max(fundamentalEnergy, 1e-18))

  return {
    fundamentalHz,
    harmonicRatioDb,
    harmonicRmsDb: 20 * Math.log10(Math.sqrt(harmonicEnergy) + 1e-12),
  }
}

async function measureRun({ saturationEnabled, label }) {
  MASTER_TUNING.masterSaturationEnabled = saturationEnabled

  let diagnostics = null
  let engineRef = null

  const rendered = await Tone.Offline(async ({ transport }) => {
    const engine = new DroneEngine()
    engineRef = engine
    engine.setPreset(DEFAULT_PRESET)
    engine.setMood('new')

    await engine.start('C', 1.0, 3, 70, 35, FIXED_REVERB_PERCENT)

    transport.schedule(() => {
      diagnostics = engine.getMasterDiagnosticsSnapshot()
    }, SAMPLE_TIME_SECONDS)
    transport.start(0)
  }, RENDER_SECONDS, 2, 48000)

  if (!diagnostics && engineRef) {
    diagnostics = engineRef.getMasterDiagnosticsSnapshot()
  }

  const audioBuffer = rendered.get()
  const output = analyzeTail(audioBuffer)
  const harmonics = analyzeHarmonics(audioBuffer)

  return {
    label,
    saturationEnabled,
    startupFadeSeconds: TRANSITION_TUNING.startFadeSeconds,
    sampleTimeSeconds: SAMPLE_TIME_SECONDS,
    stageMeters: diagnostics,
    outputTail: output,
    harmonics,
  }
}

function formatDb(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} dBFS` : 'n/a'
}

function printReport(report) {
  console.log(`\n=== ${report.label} ===`)
  console.log(`Saturation: ${report.saturationEnabled ? 'ON' : 'BYPASS'}`)
  console.log(`Startup fade: ${report.startupFadeSeconds}s | sample @ ${report.sampleTimeSeconds}s`)

  if (report.stageMeters) {
    const s = report.stageMeters
    console.log('Stage RMS (steady-state sample):')
    console.log(`  preMaster:        ${formatDb(s.preMasterRmsDb)}`)
    console.log(`  postCompressor:   ${formatDb(s.postCompressorRmsDb)}`)
    console.log(`  postSaturation:   ${formatDb(s.postSaturationRmsDb)}`)
    console.log(`  postMakeup:       ${formatDb(s.postMakeupRmsDb)}`)
    console.log(`  compressor GR:    ${s.compressorReductionDb?.toFixed(2) ?? 'n/a'} dB`)
    console.log(`  limiter GR:       ${s.limiterReductionDb?.toFixed(2) ?? 'n/a'} dB`)
  } else {
    console.log('Stage meters: not captured')
  }

  const o = report.outputTail
  console.log(`Output tail (${o.tailSeconds}s): RMS ${o.rmsDb.toFixed(2)} dBFS | peak ${o.peakDb.toFixed(2)} dBFS | crest ${o.crestDb.toFixed(2)} dB | clips ${o.clipPercent.toFixed(3)}%`)
  console.log(`Harmonics vs fundamental (C3): ${report.harmonics.harmonicRatioDb.toFixed(2)} dB | harmonic RMS ${report.harmonics.harmonicRmsDb.toFixed(2)} dBFS`)
}

function compareReports(withSat, withoutSat) {
  console.log('\n=== A/B COMPARISON ===')

  const compGrWith = withSat.stageMeters?.compressorReductionDb ?? 0
  const compGrWithout = withoutSat.stageMeters?.compressorReductionDb ?? 0
  const limGrWith = withSat.stageMeters?.limiterReductionDb ?? 0
  const limGrWithout = withoutSat.stageMeters?.limiterReductionDb ?? 0

  console.log(`Compressor GR: sat ON ${compGrWith.toFixed(2)} dB | sat OFF ${compGrWithout.toFixed(2)} dB`)
  console.log(`Limiter GR:    sat ON ${limGrWith.toFixed(2)} dB | sat OFF ${limGrWithout.toFixed(2)} dB`)
  console.log(`Output RMS:    sat ON ${withSat.outputTail.rmsDb.toFixed(2)} dBFS | sat OFF ${withoutSat.outputTail.rmsDb.toFixed(2)} dBFS`)
  console.log(`Output clips:  sat ON ${withSat.outputTail.clipPercent.toFixed(3)}% | sat OFF ${withoutSat.outputTail.clipPercent.toFixed(3)}%`)
  console.log(`Output crest:  sat ON ${withSat.outputTail.crestDb.toFixed(2)} dB | sat OFF ${withoutSat.outputTail.crestDb.toFixed(2)} dB`)
  console.log(`Harmonic ratio: sat ON ${withSat.harmonics.harmonicRatioDb.toFixed(2)} dB | sat OFF ${withoutSat.harmonics.harmonicRatioDb.toFixed(2)} dB (vs C3 fundamental)`)

  const rmsDelta = withoutSat.outputTail.rmsDb - withSat.outputTail.rmsDb
  const clipDelta = withoutSat.outputTail.clipPercent - withSat.outputTail.clipPercent
  const harmonicDelta = withSat.harmonics.harmonicRatioDb - withoutSat.harmonics.harmonicRatioDb

  console.log('\nInterpretation hints:')
  if (clipDelta < -0.1) {
    console.log('- Clipping reduced with saturation bypassed → saturation and/or post-sat gain is a distortion source.')
  } else if (clipDelta > 0.1) {
    console.log('- More clipping with saturation bypassed → limiter/compressor input level is the issue, not saturation harmonics.')
  } else {
    console.log('- Similar clip levels → distortion may be speaker playback / mechanical, or limiter/compressor GR dominates both paths.')
  }

  if (Math.abs(compGrWith) > 2 || Math.abs(compGrWithout) > 2) {
    console.log(`- Compressor is working ${Math.max(Math.abs(compGrWith), Math.abs(compGrWithout)).toFixed(1)}+ dB on sustained drone — continuous compression on a steady tone.`)
  }

  if (harmonicDelta > 1) {
    console.log(`- Saturation adds ~${harmonicDelta.toFixed(1)} dB more harmonic energy vs fundamental — likely driver of Bluetooth/external speaker breakup even without digital clips.`)
  }

  console.log(`- Loudness delta (bypass - on): ${rmsDelta >= 0 ? '+' : ''}${rmsDelta.toFixed(2)} dB RMS`)
}

const args = parseArgs(process.argv.slice(2))

try {
  if (args.mode === 'both') {
    const withSat = await measureRun({ saturationEnabled: true, label: 'Shruti Medium I70 V100 — SAT ON' })
    const withoutSat = await measureRun({ saturationEnabled: false, label: 'Shruti Medium I70 V100 — SAT BYPASS' })
    printReport(withSat)
    printReport(withoutSat)
    compareReports(withSat, withoutSat)
  } else if (args.mode === 'no-saturation') {
    const report = await measureRun({ saturationEnabled: false, label: 'Shruti Medium I70 V100 — SAT BYPASS' })
    printReport(report)
  } else {
    const report = await measureRun({ saturationEnabled: true, label: 'Shruti Medium I70 V100 — SAT ON' })
    printReport(report)
  }
} catch (error) {
  console.error('Master stage measurement failed:', error)
  process.exit(1)
}
