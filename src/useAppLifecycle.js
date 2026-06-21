import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { droneEngine } from './droneEngine'

function stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying) {
  const { wasPlaying, wasMetronomePlaying } = droneEngine.stopForLifecycle()

  if (wasPlaying) {
    setIsPlaying(false)
  }

  if (wasMetronomePlaying) {
    setIsMetronomePlaying(false)
  }
}

export function useAppLifecycle(setIsPlaying, setIsMetronomePlaying) {
  useEffect(() => {
    const handleBackground = () => {
      stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying)
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleBackground()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', handleBackground)

    let appListenerHandle = null
    let cancelled = false

    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) {
          return
        }

        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            handleBackground()
          }
        }).then((handle) => {
          if (cancelled) {
            handle.remove()
            return
          }

          appListenerHandle = handle
        })
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', handleBackground)
      appListenerHandle?.remove()
    }
  }, [setIsPlaying, setIsMetronomePlaying])
}
