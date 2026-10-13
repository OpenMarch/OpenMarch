/**
 * True in the web build (editor.openmarch.com), where the app runs in a
 * browser tab with no Electron: no native windows or menus, one show at a
 * time, and saving downloads a `.dots` file. See `web/README.md`.
 */
export const isWebBuild = import.meta.env.VITE_PUBLIC_WEB_BUILD === "true";

/** "stable", "nightly" or "dev" in the web build; undefined in Electron. */
export const webChannel: string | undefined = import.meta.env
    .VITE_PUBLIC_WEB_CHANNEL;
