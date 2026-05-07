// Typographic scale — used by tailwind.config.js for fontSize / fontFamily / fontWeight.
// Sizes are tuples of [size, { lineHeight, letterSpacing? }] to match Tailwind's expected shape.

export const fontFamily = {
  sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
}

export const fontWeight = {
  regular:  '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
  extrabold:'800',
}

// Tailwind-compatible fontSize map.
export const fontSize = {
  xs:    ['0.75rem',  { lineHeight: '1rem' }],          // 12 / 16
  sm:    ['0.875rem', { lineHeight: '1.25rem' }],       // 14 / 20
  base:  ['1rem',     { lineHeight: '1.5rem' }],        // 16 / 24
  lg:    ['1.125rem', { lineHeight: '1.75rem' }],       // 18 / 28
  xl:    ['1.25rem',  { lineHeight: '1.875rem' }],      // 20 / 30
  '2xl': ['1.5rem',   { lineHeight: '2rem' }],          // 24 / 32
  '3xl': ['1.875rem', { lineHeight: '2.375rem' }],      // 30 / 38
  '4xl': ['2.25rem',  { lineHeight: '2.75rem',  letterSpacing: '-0.01em' }], // 36
  '5xl': ['3rem',     { lineHeight: '3.375rem', letterSpacing: '-0.02em' }], // 48
  '6xl': ['3.75rem',  { lineHeight: '4rem',     letterSpacing: '-0.025em' }],// 60
  '7xl': ['4.5rem',   { lineHeight: '4.75rem',  letterSpacing: '-0.03em' }], // 72
  display: ['5.25rem',{ lineHeight: '5.5rem',   letterSpacing: '-0.035em' }],// 84
}

// Semantic role tokens — useful when authoring components in JS rather than classes.
export const textRole = {
  display:    { fontSize: fontSize['6xl'][0],   weight: fontWeight.extrabold },
  h1:         { fontSize: fontSize['5xl'][0],   weight: fontWeight.extrabold },
  h2:         { fontSize: fontSize['4xl'][0],   weight: fontWeight.bold },
  h3:         { fontSize: fontSize['3xl'][0],   weight: fontWeight.bold },
  h4:         { fontSize: fontSize['2xl'][0],   weight: fontWeight.semibold },
  bodyLg:     { fontSize: fontSize.lg[0],       weight: fontWeight.regular },
  body:       { fontSize: fontSize.base[0],     weight: fontWeight.regular },
  bodySm:     { fontSize: fontSize.sm[0],       weight: fontWeight.regular },
  caption:    { fontSize: fontSize.xs[0],       weight: fontWeight.medium },
  buttonLg:   { fontSize: fontSize.base[0],     weight: fontWeight.semibold },
  button:     { fontSize: fontSize.sm[0],       weight: fontWeight.semibold },
}

export default { fontFamily, fontWeight, fontSize, textRole }
