/**
 * Small deterministic generator (Park-Miller) so a venue builds the same crowd
 * every time. Returns floats in [0, 1).
 */
export function createRng(seed: number): () => number {
    let s = Math.max(1, Math.floor(seed) % 2147483647);
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}
