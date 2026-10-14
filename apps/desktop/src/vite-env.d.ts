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
    /** The web build's release channel: "stable", "nightly" or "dev". */
    readonly VITE_PUBLIC_WEB_CHANNEL?: string;
    /** JSON list of the example shows a preview web build offers. */
    readonly VITE_PUBLIC_WEB_EXAMPLES?: string;
    /** The app's version, in the web build's worker. */
    readonly VITE_PUBLIC_APP_VERSION?: string;
}
declare module "@fontsource/dm-mono";
declare module "@fontsource/dm-sans";
