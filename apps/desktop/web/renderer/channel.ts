/**
 * The release channel this build was made for. What a build keeps in the
 * browser is namespaced by channel, so builds served from one origin (such
 * as `web:dev` and `web:preview` on localhost) don't share a show: one
 * migrated by nightly may not open in stable.
 */
export const WEB_CHANNEL: string =
    import.meta.env.VITE_PUBLIC_WEB_CHANNEL || "dev";

export function storageKey(name: string) {
    return `openmarch-web:${WEB_CHANNEL}:${name}`;
}
