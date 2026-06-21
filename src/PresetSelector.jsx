import { useEffect, useRef, useState } from 'react'
import { PRESETS } from './presets'
import { getMoonLabel } from './moonLabels'

export function PresetSelector({ selectedPresetName, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

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

  function handleSelect(presetName) {
    onChange(presetName)
    setIsOpen(false)
  }

  const selectedMoonLabel = getMoonLabel(selectedPresetName)

  return (
    <div className="popover preset-selector" ref={containerRef}>
      <button
        type="button"
        className="popover-trigger preset-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Moon: ${selectedMoonLabel}. Change moon`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="popover-trigger-label">Moon</span>
        <span className="popover-trigger-value">{selectedMoonLabel}</span>
        <svg className="popover-caret" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6 L8 10 L12 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen ? (
        <div className="popover-menu" role="menu" aria-label="Moon">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              role="menuitemradio"
              aria-checked={preset.name === selectedPresetName}
              className={
                preset.name === selectedPresetName
                  ? 'popover-option selected'
                  : 'popover-option'
              }
              onClick={() => handleSelect(preset.name)}
            >
              <span className="popover-option-label">{getMoonLabel(preset.name)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
