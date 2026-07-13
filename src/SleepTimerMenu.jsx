import { useEffect, useRef, useState } from 'react'
import { SLEEP_TIMER_OPTIONS } from './sleepTimerOptions'

export function SleepTimerMenu({
  enabled,
  supported,
  isActive,
  selectedDurationSeconds,
  triggerAriaLabel,
  onSelectDuration,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
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

  if (!supported) {
    return null
  }

  function handleSelect(value) {
    onSelectDuration(value)
    setIsOpen(false)
  }

  const disabled = !enabled

  return (
    <div className="sleep-timer-selector" ref={containerRef}>
      <button
        type="button"
        className={
          isActive && !disabled
            ? 'header-icon-button sleep-timer-trigger active'
            : 'header-icon-button sleep-timer-trigger'
        }
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="sleep-timer-menu"
        aria-label={triggerAriaLabel()}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((open) => !open)
          }
        }}
      >
        <svg className="sleep-timer-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="8.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M12 7.5 V12 L15.2 14.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen ? (
        <div
          id="sleep-timer-menu"
          className="sleep-timer-menu popover-menu"
          role="menu"
          aria-label="Sleep timer"
        >
          <p className="sleep-timer-menu-title">Sleep Timer</p>
          <p className="sleep-timer-menu-hint">Audio will gently fade before stopping.</p>
          {SLEEP_TIMER_OPTIONS.map((option) => {
            const selected = option.value === 0
              ? !isActive
              : selectedDurationSeconds === option.value && isActive
            return (
              <button
                key={option.label}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                aria-label={
                  option.value === 0
                    ? 'Sleep timer off'
                    : `Set sleep timer to ${option.label}`
                }
                className={selected ? 'sleep-timer-option selected' : 'sleep-timer-option'}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
