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
    },
  },
  plugins: [],
}
