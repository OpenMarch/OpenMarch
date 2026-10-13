/**
 * Stands in for `@sentry/electron/renderer` in the web build. The app
 * initializes Sentry disabled, so nothing is lost.
 */
export function init(_options?: unknown) {}
export function captureException(_error?: unknown) {}
export function captureMessage(_message?: string) {}
