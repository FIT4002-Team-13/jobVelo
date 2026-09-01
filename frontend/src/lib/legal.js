// Single source of truth for the legal identity used by the footer and the
// Privacy / Terms pages. Replace the TODO values once before launch - every
// page reads from here, so it's a one-file change.
export const LEGAL = {
  productName: 'jobVelo',
  // TODO: replace with the registered legal entity operating the service
  // (e.g. "jobVelo Pty Ltd" / the client company's entity).
  legalEntity: 'jobVelo',
  // TODO: replace with a monitored inbox before going live.
  contactEmail: 'support@jobvelo.app',
  // TODO: confirm governing law with the client (defaulting to the project's
  // home jurisdiction).
  jurisdiction: 'Victoria, Australia',
  effectiveDate: '29 August 2026',
}
