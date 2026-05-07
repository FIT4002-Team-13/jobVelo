// Brand palette — single source of truth for colour.
// Imported by tailwind.config.js so utility classes (bg-primary-500, text-coral-500, etc.)
// stay in sync with anything that needs raw hex values (canvas, SVG, charts).

export const colors = {
  // Primary brand blue — main brand colour, CTAs, links
  // Base: #5D89E9
  primary: {
    50:  '#EEF2FD',
    100: '#DCE5FB',
    200: '#B9CBF7',
    300: '#91ADF1',
    400: '#7A9CED',
    500: '#5D89E9', // base
    600: '#4A6FC4',
    700: '#38559A',
    800: '#2A4078',
    900: '#1C2C56',
  },

  // Sky — sub/tag/button accent (bright blue)
  // Base: #23A1FB
  sky: {
    50:  '#E6F4FF',
    100: '#C9E8FE',
    200: '#95D2FD',
    300: '#5DBAFC',
    400: '#3FAEFC',
    500: '#23A1FB', // base
    600: '#1B82CC',
    700: '#14629A',
    800: '#0E4570',
    900: '#082D4A',
  },

  // Mint — sub/tag/button accent (positive states)
  // Base: #68E3AD
  mint: {
    50:  '#ECFDF5',
    100: '#D2F8E5',
    200: '#A8F0CD',
    300: '#80E8B7',
    400: '#68E3AD', // base
    500: '#3FD493',
    600: '#2EAB75',
    700: '#228257',
    800: '#185D3E',
    900: '#103D29',
  },

  // Coral — sub/tag/button accent (warm highlights, destructive)
  // Base: #FF7376
  coral: {
    50:  '#FFF1F2',
    100: '#FFDDDF',
    200: '#FFBCBE',
    300: '#FF9CA0',
    400: '#FF8588',
    500: '#FF7376', // base
    600: '#E25558',
    700: '#B53E40',
    800: '#852E2F',
    900: '#5A1F20',
  },

  // Neutral / surface
  neutral: {
    0:   '#FFFFFF',
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },

  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  danger:  '#EF4444',
  info:    '#23A1FB',

  // Soft tints for hero gradients and section backgrounds
  tint: {
    blue:  '#EBF1FE',
    sky:   '#E6F4FF',
    mint:  '#E5FAF0',
    coral: '#FFE6E7',
    peach: '#FFF4EC',
  },
}

export default colors
