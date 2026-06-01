export type EffectPlaybackState = "upcoming" | "active" | "played";

export type EffectPlaybackInfo = {
    state: EffectPlaybackState;
    progressPct: number;
};

export type OrderedEffectRuntime = {
    id: number;
    durationMs: number;
};

export function deriveEffectPlaybackStates(
    effects: readonly OrderedEffectRuntime[],
    tSceneMs: number | null,
): Map<number, EffectPlaybackInfo> {
    const out = new Map<number, EffectPlaybackInfo>();
    if (tSceneMs == null) {
        effects.forEach((effect) => {
            out.set(effect.id, { state: "upcoming", progressPct: 0 });
        });
        return out;
    }

    let cursorMs = 0;
    effects.forEach((effect) => {
        const startMs = cursorMs;
        const safeDurationMs = Math.max(0, effect.durationMs);
        const endMs = startMs + safeDurationMs;
        let state: EffectPlaybackState = "upcoming";
        let progressPct = 0;
        if (safeDurationMs > 0 && tSceneMs >= startMs && tSceneMs < endMs) {
            state = "active";
            progressPct = Math.min(
                100,
                Math.max(0, ((tSceneMs - startMs) / safeDurationMs) * 100),
            );
        } else if (tSceneMs >= endMs) {
            state = "played";
            progressPct = 100;
        }

        out.set(effect.id, { state, progressPct });
        cursorMs = endMs;
    });

    return out;
}
