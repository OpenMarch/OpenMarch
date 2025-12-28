/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly PACKAGE_VERSION: string;
    readonly VITE_PUBLIC_POSTHOG_HOST: string;
    readonly VITE_PUBLIC_POSTHOG_KEY: string;
    readonly VITE_PUBLIC_PLAYWRIGHT_SESSION: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
