// Layout patterns — reusable className strings for common UI structures.
// Import into components to keep class strings consistent across the app.

//  Flex 
// Base flex directional and alignment combos.

export const flex = {
  row:         'flex items-center',
  rowBetween:  'flex items-center justify-between',
  rowEnd:      'flex items-center justify-end',
  rowCenter:   'flex items-center justify-center',
  col:         'flex flex-col',
  colCenter:   'flex flex-col items-center justify-center',
  wrap:        'flex flex-wrap items-center',
}

//  Gap 
// Mirrors the spacing scale from spacing.js for use inside flex/grid containers.

export const gap = {
  1:   'gap-1',    // 4px
  1.5: 'gap-1.5',  // 6px
  2:   'gap-2',    // 8px
  2.5: 'gap-2.5',  // 10px
  3:   'gap-3',    // 12px
  4:   'gap-4',    // 16px
  5:   'gap-5',    // 20px
  6:   'gap-6',    // 24px
  8:   'gap-8',    // 32px
  10:  'gap-10',   // 40px
}

//  Card 
// White panels with a neutral border — the main surface pattern in the app.

export const card = {
  base: 'bg-neutral-0 border border-neutral-200 rounded-2xl p-6',
  sm:   'bg-neutral-0 border border-neutral-200 rounded-xl p-4',
  flat: 'bg-neutral-0 border border-neutral-200 rounded-2xl',
}

//  Badge
// Status chips and tag pills.

export const badge = {
  base: 'text-xs font-semibold px-3 py-1 rounded-pill',
  sm:   'text-xs font-semibold px-2.5 py-1 rounded-md',
}

//  Form 
// Input fields and their labels — used in JobFormModal and AddCandidateModal.

export const form = {
  label: 'block text-xs font-bold text-neutral-600 mb-1.5 tracking-wide uppercase',
  input: 'w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-300',
  error: 'text-xs text-coral-500',
}

//  Button 
// Common button variants — use as a base, add sizing/width classes on top.

export const button = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors',
  outline: 'border border-primary-500 text-primary-500 hover:bg-primary-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors',
  ghost:   'text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors',
  danger:  'bg-coral-500 hover:bg-coral-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60',
  cancel:  'border border-neutral-300 text-sm font-medium text-neutral-600 hover:bg-neutral-50 rounded-lg',
}

//  Modal 
// Overlay + panel pattern shared by JobFormModal and AddCandidateModal.

export const modal = {
  overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4',
  panel:   'bg-neutral-0 rounded-2xl shadow-xl p-6 relative w-full',
}

//  Page 
// Full-page layout patterns.

export const page = {
  shell:    'flex h-screen bg-neutral-50 font-sans',
  loading:  'flex h-screen items-center justify-center bg-neutral-50 font-sans',
  main:     'flex-1 overflow-y-auto px-10 py-8',
}

export default { flex, gap, card, badge, form, button, modal, page }
