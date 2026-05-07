// Spacing scale — base unit 4px (0.25rem). Tailwind already ships this scale,
// but defining it explicitly makes the design system self-contained and lets us add
// project-specific aliases (section, gutter) without monkey-patching Tailwind defaults.

const unit = 0.25 // rem

const step = (n) => `${n * unit}rem`

export const spacing = {
  0:    '0px',
  px:   '1px',
  0.5:  step(0.5),  // 2
  1:    step(1),    // 4
  1.5:  step(1.5),  // 6
  2:    step(2),    // 8
  2.5:  step(2.5),  // 10
  3:    step(3),    // 12
  3.5:  step(3.5),  // 14
  4:    step(4),    // 16
  4.5:  step(4.5),  // 18
  5:    step(5),    // 20
  6:    step(6),    // 24
  7:    step(7),    // 28
  8:    step(8),    // 32
  9:    step(9),    // 36
  10:   step(10),   // 40
  11:   step(11),   // 44
  12:   step(12),   // 48
  14:   step(14),   // 56
  16:   step(16),   // 64
  20:   step(20),   // 80
  24:   step(24),   // 96
  28:   step(28),   // 112
  32:   step(32),   // 128
  40:   step(40),   // 160
  48:   step(48),   // 192
  56:   step(56),   // 224
  64:   step(64),   // 256

  // Project-specific aliases
  gutter:    '1.5rem',  // horizontal page padding (mobile)
  gutterLg:  '4rem',    // horizontal page padding (desktop)
  section:   '6rem',    // vertical rhythm between landing sections
  sectionSm: '4rem',    // tighter rhythm on mobile
}

export const radii = {
  none: '0',
  sm:   '0.25rem',  // 4
  md:   '0.5rem',   // 8
  lg:   '0.75rem',  // 12
  xl:   '1rem',     // 16
  '2xl':'1.5rem',   // 24
  '3xl':'2rem',     // 32
  pill: '9999px',
}

export const shadows = {
  xs:   '0 1px 2px rgba(15, 23, 42, 0.04)',
  sm:   '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
  md:   '0 4px 12px rgba(15, 23, 42, 0.08)',
  lg:   '0 12px 32px rgba(15, 23, 42, 0.10)',
  xl:   '0 24px 48px rgba(15, 23, 42, 0.12)',
  glow: '0 16px 48px rgba(93, 137, 233, 0.28)',
}

export default { spacing, radii, shadows }
