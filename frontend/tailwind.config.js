import { colors } from './src/styles/colors.js'
import { fontFamily, fontSize, fontWeight } from './src/styles/typography.js'
import { spacing, radii, shadows } from './src/styles/spacing.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    // Replace defaults so the only available tokens are the ones we curate.
    fontFamily,
    fontSize,
    fontWeight,
    spacing,
    borderRadius: radii,
    boxShadow: shadows,

    extend: {
      colors: {
        ...colors,
        // Convenience aliases
        bg: colors.neutral[0],
        ink: colors.neutral[900],
        muted: colors.neutral[500],
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(60% 60% at 20% 30%, rgba(93,137,233,0.20) 0%, rgba(93,137,233,0) 70%), radial-gradient(50% 50% at 90% 10%, rgba(255,115,118,0.16) 0%, rgba(255,115,118,0) 70%), radial-gradient(50% 50% at 80% 90%, rgba(104,227,173,0.18) 0%, rgba(104,227,173,0) 70%)',
        'brand-gradient':
          'linear-gradient(135deg, #5D89E9 0%, #23A1FB 50%, #68E3AD 100%)',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        blob: {
          '0%, 100%': { borderRadius: '60% 40% 55% 45% / 50% 60% 40% 50%' },
          '50%':      { borderRadius: '40% 60% 45% 55% / 60% 40% 60% 40%' },
        },
        // Morphing blob keyframes used by the Hero background. Each blob
        // traces a 4-stop orbital path that forms a closed loop, so the
        // motion feels continuous rather than bouncing back-and-forth.
        // Each orb gets a unique loop shape, direction, scale envelope and
        // duration - the composition never visually repeats.
        morphA: {
          // Large clockwise sweep (top -> right -> bottom -> left)
          '0%, 100%': { transform: 'translate(0,0) scale(1) rotate(0deg)' },
          '25%':      { transform: 'translate(380px,120px) scale(1.10) rotate(25deg)' },
          '50%':      { transform: 'translate(520px,380px) scale(0.95) rotate(50deg)' },
          '75%':      { transform: 'translate(140px,320px) scale(1.05) rotate(20deg)' },
        },
        morphB: {
          // Tight counter-clockwise loop in the upper middle
          '0%, 100%': { transform: 'translate(0,0) scale(1) rotate(0deg)' },
          '25%':      { transform: 'translate(220px,180px) scale(1.20) rotate(-30deg)' },
          '50%':      { transform: 'translate(-180px,260px) scale(0.90) rotate(-60deg)' },
          '75%':      { transform: 'translate(-340px,80px) scale(1.10) rotate(-30deg)' },
        },
        morphC: {
          // Long horizontal cruise that arcs slightly up then down
          '0%, 100%': { transform: 'translate(0,0) scale(1) rotate(0deg)' },
          '25%':      { transform: 'translate(380px,-80px) scale(1.05) rotate(15deg)' },
          '50%':      { transform: 'translate(680px,60px) scale(1.15) rotate(30deg)' },
          '75%':      { transform: 'translate(420px,200px) scale(1.00) rotate(15deg)' },
        },
        morphD: {
          // Diagonal vertical drift
          '0%, 100%': { transform: 'translate(0,0) scale(1) rotate(0deg)' },
          '25%':      { transform: 'translate(-150px,-160px) scale(1.08) rotate(-15deg)' },
          '50%':      { transform: 'translate(-320px,-420px) scale(1.15) rotate(-30deg)' },
          '75%':      { transform: 'translate(-180px,-260px) scale(0.95) rotate(-15deg)' },
        },
      },
      animation: {
        floaty:  'floaty 6s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        blob:    'blob 12s ease-in-out infinite',
        // Long durations + ease-in-out on each segment of the 4-stop path
        // give a continuous-flow feel rather than a bouncy back-and-forth.
        'morph-a': 'morphA 26s ease-in-out infinite',
        'morph-b': 'morphB 22s ease-in-out infinite',
        'morph-c': 'morphC 30s ease-in-out infinite',
        'morph-d': 'morphD 34s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
