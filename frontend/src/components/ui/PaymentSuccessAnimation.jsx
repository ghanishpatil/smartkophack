import { useEffect, useState, useRef } from 'react'
import { useRive } from '@rive-app/react-canvas'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * PaymentSuccessAnimation - Sequenced Rive animations for payment success
 * 
 * Plays two animations in sequence:
 * 1. Credit card payment animation (processing)
 * 2. Payment done animation (success confirmation)
 * 
 * @param {boolean} show - Whether to show the animation overlay
 * @param {function} onComplete - Callback when both animations complete
 */
export function PaymentSuccessAnimation({ show, onComplete }) {
  const [currentAnimation, setCurrentAnimation] = useState('processing') // 'processing' | 'success' | 'done'
  
  // First animation - Credit card payment processing
  const { RiveComponent: ProcessingAnimation, rive: processingRive } = useRive({
    src: '/credit-card-payment.riv',
    autoplay: false,
    stateMachines: 'State Machine 1',
  })

  // Second animation - Payment done checkmark
  const { RiveComponent: SuccessAnimation, rive: successRive } = useRive({
    src: '/payment-done.riv',
    autoplay: false,
    stateMachines: 'State Machine 1',
  })

  useEffect(() => {
    if (!show) {
      setCurrentAnimation('processing')
      return
    }

    // Start the first animation (processing)
    if (processingRive && currentAnimation === 'processing') {
      processingRive.play()

      // Listen for animation completion
      const checkProcessingComplete = setInterval(() => {
        // Most Rive animations loop, so we'll use a timer instead
        // Typically credit card animations are 2-3 seconds
      }, 100)

      // After 3 seconds, switch to success animation
      const timer = setTimeout(() => {
        clearInterval(checkProcessingComplete)
        processingRive.pause()
        setCurrentAnimation('success')
      }, 3000)

      return () => {
        clearTimeout(timer)
        clearInterval(checkProcessingComplete)
      }
    }
  }, [show, processingRive, currentAnimation])

  useEffect(() => {
    if (currentAnimation === 'success' && successRive) {
      successRive.play()

      // After success animation completes (typically 2-3 seconds)
      const timer = setTimeout(() => {
        successRive.pause()
        setCurrentAnimation('done')
        // Wait a bit before closing to show the final frame
        setTimeout(() => {
          if (onComplete) onComplete()
        }, 500)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [currentAnimation, successRive, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center"
          >
            {/* Processing Animation */}
            {currentAnimation === 'processing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-80 w-80 sm:h-96 sm:w-96"
              >
                <ProcessingAnimation />
              </motion.div>
            )}

            {/* Success Animation */}
            {currentAnimation === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="h-80 w-80 sm:h-96 sm:w-96"
              >
                <SuccessAnimation />
              </motion.div>
            )}

            {/* Text overlay */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 text-center"
            >
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                {currentAnimation === 'processing' && 'Processing Payment...'}
                {currentAnimation === 'success' && 'Payment Successful!'}
              </h2>
              <p className="mt-2 text-sm text-white/80">
                {currentAnimation === 'processing' && 'Please wait while we verify your payment'}
                {currentAnimation === 'success' && 'Your registration is now complete'}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
