/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
    /** "stable" (openmarch.com) or "preview" (preview.openmarch.com). */
    readonly PUBLIC_SITE_CHANNEL: string;
    /** Where the download buttons get the installers. */
    readonly PUBLIC_DOWNLOAD_URL: string;
}
