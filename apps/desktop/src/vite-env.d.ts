/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Clerk OAuth domain; set with VITE_CLERK_CLIENT_ID to enable sign-in. */
    readonly VITE_CLERK_AUTHORIZATION_DOMAIN?: string;
    /** Clerk OAuth client ID; set with VITE_CLERK_AUTHORIZATION_DOMAIN to enable sign-in. */
    readonly VITE_CLERK_CLIENT_ID?: string;
}
