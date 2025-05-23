export function mixedMeterPermutations(
    totalBeats: number,
    allowed: number[] = [2, 3],
): number[][] {
    const results: number[][] = [];

    function backtrack(remaining: number, path: number[]) {
        if (remaining === 0) {
            results.push([...path]);
            return;
        }
        for (const beat of allowed) {
            if (remaining - beat >= 0) {
                path.push(beat);
                backtrack(remaining - beat, path);
                path.pop();
            }
        }
    }
    backtrack(totalBeats, []);
    return results.length === 1 && results[0].length === 0
        ? []
        : results.reverse();
}
