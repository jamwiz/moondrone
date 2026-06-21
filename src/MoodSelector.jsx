import { useEffect, useRef, useState } from 'react'
import { MOODS, getMoodShortName } from './moods'

export function MoodSelector({ selectedMoodId, onChange }) {
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

  function handleSelect(moodId) {
    onChange(moodId)
    setIsOpen(false)
  }

  const selectedMoodName = getMoodShortName(selectedMoodId)

  return (
    <div className="popover mood-selector" ref={containerRef}>
      <button
        type="button"
        className="popover-trigger mood-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Phase: ${selectedMoodName}. Change phase`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="popover-trigger-label">Phase</span>
        <span className="popover-trigger-value">{selectedMoodName}</span>
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
        <div className="popover-menu" role="menu" aria-label="Phase">
          {MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              role="menuitemradio"
              aria-checked={mood.id === selectedMoodId}
              className={
                mood.id === selectedMoodId
                  ? 'popover-option selected'
                  : 'popover-option'
              }
              onClick={() => handleSelect(mood.id)}
            >
              <span className="popover-option-label">{mood.short}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
