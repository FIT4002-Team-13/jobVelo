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
        'brand-gradient':
          'linear-gradient(135deg, #5D89E9 0%, #23A1FB 50%, #68E3AD 100%)',
      },
    },
  },
  plugins: [],
}
