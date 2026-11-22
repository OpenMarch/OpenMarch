/**
 * Main answers this synchronously with the saved theme, so the desktop preload has it before the
 * page's first paint (index.html). The web build has no such channel.
 */
export const THEME_SYNC_CHANNEL = "theme:get-sync";
