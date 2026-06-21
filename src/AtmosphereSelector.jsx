import { useEffect, useRef, useState } from 'react'
import { ATMOSPHERES, getAtmosphere } from './atmospheres'

export function AtmosphereSelector({ atmosphereId, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const active = getAtmosphere(atmosphereId)

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

  function handleSelect(id) {
    onChange(id)
    setIsOpen(false)
  }

  return (
    <div className="atmosphere-selector" ref={containerRef}>
      <button
        type="button"
        className="atmosphere-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Atmosphere: ${active.label}. Change atmosphere`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="atmosphere-trigger-symbol" aria-hidden="true">
          {active.symbol}
        </span>
      </button>

      {isOpen ? (
        <div className="atmosphere-menu" role="menu" aria-label="Atmosphere">
          {ATMOSPHERES.map((atmosphere) => (
            <button
              key={atmosphere.id}
              type="button"
              role="menuitemradio"
              aria-checked={atmosphere.id === atmosphereId}
              className={
                atmosphere.id === atmosphereId
                  ? 'atmosphere-option selected'
                  : 'atmosphere-option'
              }
              onClick={() => handleSelect(atmosphere.id)}
            >
              <span className="atmosphere-option-symbol" aria-hidden="true">
                {atmosphere.symbol}
              </span>
              <span className="atmosphere-option-label">{atmosphere.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
