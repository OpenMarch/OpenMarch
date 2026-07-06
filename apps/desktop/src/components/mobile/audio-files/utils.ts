/**
 * Get audio duration in seconds using the Web Audio API.
 * Accepts File or Blob (e.g. from ArrayBuffer). Returns null if duration
 * cannot be determined (e.g., unsupported format).
 */
export async function getAudioDuration(
    source: File | Blob,
): Promise<number | null> {
    const url = URL.createObjectURL(source);
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.addEventListener(
            "loadedmetadata",
            () => {
                URL.revokeObjectURL(url);
                const duration = audio.duration;
                resolve(Number.isFinite(duration) ? duration : null);
            },
            { once: true },
        );
        audio.addEventListener(
            "error",
            () => {
                URL.revokeObjectURL(url);
                resolve(null);
            },
            { once: true },
        );
    });
}

/**
 * Get audio size in megabytes (decimal) from a File or Blob.
 */
export function getAudioSizeMegabytes(source: File | Blob): number {
    return source.size / 1_000_000;
}
