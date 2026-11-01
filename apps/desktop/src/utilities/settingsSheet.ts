/**
 * The web editor shows Settings in a sheet over the app (see
 * components/WebSettingsSheet.tsx) rather than in a second tab: a new tab
 * is easy to lose, and on an iPad home-screen app there are no tabs. The
 * page's "settings:open" handler (web/renderer/handlers.ts) asks for it with
 * this event.
 */
export const OPEN_SETTINGS_EVENT = "openmarch:open-settings";

export function requestOpenSettings(target: EventTarget = window) {
    target.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
