/**
 * Get audio file duration in seconds using the Web Audio API.
 * Returns null if duration cannot be determined (e.g., unsupported format).
 */
export async function getAudioDuration(file: File): Promise<number | null> {
    const url = URL.createObjectURL(file);
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
 * Get audio file size in megabytes (decimal).
 */
export function getAudioSizeMegabytes(file: File): number {
    return file.size / 1_000_000;
}
