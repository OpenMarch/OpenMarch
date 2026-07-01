import { getLightingEffectProgress } from "@openmarch/core";

export type EffectPlaybackState = "upcoming" | "active" | "played";

export type EffectPlaybackInfo = {
    state: EffectPlaybackState;
    progressPct: number;
};

export type OrderedEffectRuntime = {
    id: number;
    startMs: number;
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

    effects.forEach((effect) => {
        const startMs = Math.max(0, effect.startMs);
        const safeDurationMs = Math.max(0, effect.durationMs);
        const endMs = startMs + safeDurationMs;
        const progress = getLightingEffectProgress(tSceneMs, {
            startMs: effect.startMs,
            durationMs: effect.durationMs,
        });
        const progressPct = Math.round(progress * 100);

        let state: EffectPlaybackState = "upcoming";
        if (safeDurationMs > 0 && tSceneMs >= startMs && tSceneMs < endMs) {
            state = "active";
        } else if (tSceneMs >= endMs) {
            state = "played";
        }

        out.set(effect.id, { state, progressPct });
    });

    return out;
}
