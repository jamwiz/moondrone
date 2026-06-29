// Generate minimal metronome click WAV files into public/samples/ for Vite + Capacitor.
// Run: node scripts/generate-metronome-samples.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'samples')

function createClickWav({ frequency, durationSec, gain, sampleRate = 44100 }) {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let index = 0; index < numSamples; index += 1) {
    const t = index / sampleRate
    const envelope = Math.exp(-t * 45)
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * gain
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)))
    buffer.writeInt16LE(int16, 44 + index * 2)
  }

  return buffer
}

const samples = [
  { name: 'block.high.wav', frequency: 1800, durationSec: 0.055, gain: 0.92 },
  { name: 'block.low.wav', frequency: 920, durationSec: 0.075, gain: 0.88 },
  { name: 'triangle.open.wav', frequency: 2450, durationSec: 0.11, gain: 0.72 },
  { name: 'triangle.closed.wav', frequency: 2050, durationSec: 0.035, gain: 0.82 },
]

fs.mkdirSync(outDir, { recursive: true })

for (const sample of samples) {
  const filePath = path.join(outDir, sample.name)
  fs.writeFileSync(filePath, createClickWav(sample))
  console.log(`Wrote ${filePath}`)
}

console.log('Metronome samples ready in public/samples/')
