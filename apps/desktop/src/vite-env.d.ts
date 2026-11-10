/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Clerk OAuth domain; set with VITE_CLERK_CLIENT_ID to enable sign-in. */
    readonly VITE_CLERK_AUTHORIZATION_DOMAIN?: string;
    /** Clerk OAuth client ID; set with VITE_CLERK_AUTHORIZATION_DOMAIN to enable sign-in. */
    readonly VITE_CLERK_CLIENT_ID?: string;
    /** Clerk accounts sign-up URL; required for the "Set up account" CTA when sign-in is enabled. */
    readonly VITE_SIGN_UP_URL?: string;
    /** OpenMarch web app base URL */
    readonly VITE_API_URL?: string;
    /** OpenMarch editor API base URL */
    readonly VITE_EDITOR_API_URL?: string;
    /** "true" in the web build (vite.web.config.mts). */
    readonly VITE_PUBLIC_WEB_BUILD?: string;
    /** The web build's channel: "stable", "nightly", "preview", "dev", "examples" or "lab". */
    readonly VITE_PUBLIC_WEB_CHANNEL?: string;
    /** Names the web build's browser storage: the channel, or "lab-<test id>". */
    readonly VITE_PUBLIC_WEB_STORAGE_NAMESPACE?: string;
    /** The web build's Clerk publishable key; empty where sign-in is off (vite.web.config.mts). */
    readonly VITE_PUBLIC_WEB_CLERK_PUBLISHABLE_KEY?: string;
    /** JSON list of the example shows a preview or lab web build offers. */
    readonly VITE_PUBLIC_WEB_EXAMPLES?: string;
    /** A lab build's show to open straight away, an example show's id (fork-only, web/LAB.md). */
    readonly VITE_PUBLIC_LAB_SHOW?: string;
    /** A lab build's editor mode, "basic" or "expert" (fork-only, web/LAB.md). */
    readonly VITE_PUBLIC_LAB_MODE?: string;
    /** "true" in the 3D View web preview, which has no Settings window. */
    readonly VITE_VIEW3D_NO_SETTINGS_WINDOW?: string;
    /** The app's version, in the web build's worker. */
    readonly VITE_PUBLIC_APP_VERSION?: string;
    /** "true" shows the welcome flow's What's new slides for features not on main yet, for review. */
    readonly VITE_PUBLIC_WHATS_NEW_PREVIEW?: string;
}
declare module "@fontsource/dm-mono";
declare module "@fontsource/dm-sans";
