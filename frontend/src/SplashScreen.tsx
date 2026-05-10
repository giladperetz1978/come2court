import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import lottie from 'lottie-web'

type SplashScreenProps = {
  onFinish: () => void
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let finished = false
    let anim: ReturnType<typeof lottie.loadAnimation> | null = null

    const finishOnce = () => {
      if (finished) return
      finished = true
      onFinish()
    }

    const load = async () => {
      try {
        const response = await fetch('/animations/come2court.json')
        if (!response.ok) {
          finishOnce()
          return
        }

        const animationData = await response.json()
        anim = lottie.loadAnimation({
          container: containerRef.current as Element,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          animationData,
        })

        anim.addEventListener('complete', finishOnce)
        anim.addEventListener('data_failed', finishOnce)
      } catch (_error) {
        finishOnce()
      }
    }

    load().catch(() => finishOnce())

    const fallbackTimer = window.setTimeout(finishOnce, 5000)

    return () => {
      window.clearTimeout(fallbackTimer)
      if (anim) {
        anim.removeEventListener('complete', finishOnce)
        anim.removeEventListener('data_failed', finishOnce)
        anim.destroy()
      }
    }
  }, [onFinish])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0B0F1A',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
    >
      <div ref={containerRef} style={{ width: 280 }} />

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        style={{ color: 'white', marginTop: 24 }}
      >
        Come 2 Court
      </motion.h1>
    </motion.div>
  )
}