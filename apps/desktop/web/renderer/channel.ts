/**
 * The release channel this build was made for. The stable and nightly
 * builds share an origin (editor.openmarch.com and /nightly), so everything
 * they keep in the browser is namespaced by channel: a show migrated by
 * nightly may not open in stable.
 */
export const WEB_CHANNEL: string =
    import.meta.env.VITE_PUBLIC_WEB_CHANNEL || "dev";

export function storageKey(name: string) {
    return `openmarch-web:${WEB_CHANNEL}:${name}`;
}
