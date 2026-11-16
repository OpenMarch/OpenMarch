/**
 * The equipment catalog's pictures: each front ensemble model from the audience side, rendered by
 * `scripts/view3d-assets/pit-thumbnails.py` into `assets/pit/thumbs/`. Vite emits each as its own
 * small file, fetched only when the catalog shows it.
 */
const urls = import.meta.glob<string>("../../view3d/assets/pit/thumbs/*.webp", {
    query: "?url",
    import: "default",
    eager: true,
});

/** The picture of the model `fileId` (`marimba-4.3`), or null when there is none */
export function pitThumbnailUrl(fileId: string): string | null {
    const key = Object.keys(urls).find((k) => k.endsWith(`/${fileId}.webp`));
    return key ? urls[key] : null;
}
