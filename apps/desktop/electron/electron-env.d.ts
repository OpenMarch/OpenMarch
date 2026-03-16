/// <reference types="vite-electron-plugin/electron-env" />

declare namespace NodeJS {
    interface ProcessEnv {
        VSCODE_DEBUG?: "true";
        DIST_ELECTRON: string;
        DIST: string;
        /** /dist/ or /public/ */
        VITE_PUBLIC: string;
        /** Clerk OAuth domain; set with VITE_CLERK_CLIENT_ID to enable sign-in. */
        VITE_CLERK_AUTHORIZATION_DOMAIN?: string;
        /** Clerk OAuth client ID; set with VITE_CLERK_AUTHORIZATION_DOMAIN to enable sign-in. */
        VITE_CLERK_CLIENT_ID?: string;
        /** API URL */
        VITE_API_URL?: string;
    }
}
