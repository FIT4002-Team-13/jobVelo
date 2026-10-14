import { colors } from '../../styles/colors.js'

// One identity per interviewer: colour + dash + marker shape, so lines stay
// distinguishable without relying on colour alone. Amber is deliberately NOT
// in this list - on this page amber means "high variance" and coral means
// "bias", so neither can double as a person's colour.
export const SERIES = [
  { color: colors.primary[500], dash: '',        shape: 'circle'   },
  { color: colors.mint[600],    dash: '6 4',     shape: 'square'   },
  { color: colors.coral[500],   dash: '2 4',     shape: 'diamond'  },
  { color: colors.sky[600],     dash: '9 4 2 4', shape: 'triangle' },
  { color: colors.neutral[500], dash: '12 4',    shape: 'cross'    },
]

// The team average is the reference line: the darkest brand colour, always solid.
export const TEAM_COLOR = colors.primary[900]

export const seriesFor = (idx) => SERIES[idx % SERIES.length]

export function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// "Priya Raman" -> "Priya R."
export function shortName(name = '') {
  const [first = '', second] = name.split(' ')
  return second ? `${first} ${second[0]}.` : first
}
