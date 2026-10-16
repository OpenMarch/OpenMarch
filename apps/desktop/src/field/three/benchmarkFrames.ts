import { addAfterEffect, addEffect } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import type { FrameProbe } from "@/field/benchmark/runFieldBenchmark";

/** The new field's frames: R3F's effects around a render that drew something. */
export function r3fFrames(renderer: () => WebGLRenderer | null): FrameProbe {
    return {
        listen(onStart, onEnd) {
            let framesBefore = 0;
            const offBefore = addEffect(() => {
                onStart();
                framesBefore = renderer()?.info.render.frame ?? 0;
            });
            const offAfter = addAfterEffect(() => {
                const gl = renderer();
                // R3F runs its effects on a frame that drew nothing, as its loop stops
                if (!gl || gl.info.render.frame === framesBefore) return;
                onEnd();
            });
            return () => {
                offBefore();
                offAfter();
            };
        },
        drawCalls: () => renderer()?.info.render.calls ?? 0,
    };
}
