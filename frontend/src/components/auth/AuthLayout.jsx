import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Logo from '../common/Logo.jsx'
import HeroIllustration from '../common/HeroIllustration.jsx'

export default function AuthLayout({ title, children }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-mint-50">
      {/* Soft glow */}
      <div className="absolute inset-0 -z-10 bg-hero-glow" />
      <div className="absolute -top-32 -left-24 -z-10 h-[420px] w-[420px] rounded-pill bg-primary-100/60 blur-3xl animate-blob" />
      <div className="absolute -bottom-32 -right-24 -z-10 h-[380px] w-[380px] rounded-pill bg-coral-100/60 blur-3xl animate-blob"
           style={{ animationDelay: '-5s' }} />

      <div className="container-page min-h-screen grid lg:grid-cols-2 gap-10 items-center py-10">
        {/* Form panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md mx-auto lg:mx-0"
        >
          <Link to="/" className="inline-flex items-center gap-3 mb-10">
            <span className="text-3xl lg:text-4xl font-extrabold tracking-tight text-ink">Welcome to</span>
            <Logo />
          </Link>

          {title && <h1 className="sr-only">{title}</h1>}

          {children}
        </motion.div>

        {/* Illustration panel - hidden on mobile */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
          className="hidden lg:block"
        >
          <HeroIllustration />
        </motion.div>
      </div>
    </div>
  )
}
