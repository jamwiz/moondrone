// Generation counter for metronome start/stop async work. Stale operations must not
// start schedulers, set UI state, or pause the media primer.
import { audioDiag } from './audioDiagnostics'

let generation = 0

export function beginMetronomeOperation(reason) {
  generation += 1
  audioDiag('metronome-op', 'metronome operation generation bumped', { generation, reason })
  return generation
}

export function getMetronomeOperationGeneration() {
  return generation
}

export function isMetronomeOperationCurrent(token) {
  return token === generation
}
