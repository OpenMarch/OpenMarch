/**
 * Mounts the post pass (`core/post/pipeline.ts`) on the canvas: bloom and
 * lens ghosts for a venue whose lighting asks for them, at high quality.
 *
 * While this is mounted it draws every frame itself (a `useFrame` with a
 * priority takes rendering over from the canvas), so the scene is drawn
 * once, into the pipeline. It only draws when the canvas would have: the
 * draw-when-needed policy (`DrawWhenNeeded.tsx`) is unchanged.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WebGLRenderTarget } from "three";
import {
    createPostPipeline,
    type BloomSettings,
    type PostPipeline,
} from "@/view3d/core/post";
import { requestDraw } from "./drawWake";

let active: PostPipeline | null = null;

/**
 * The target the scene is drawn into while the post pass is on, or null.
 * Shaders compiled ahead of time (`warmLighting.ts`) must be compiled with
 * it bound: a material compiles differently for a target than for the canvas.
 */
export function postSceneTarget(): WebGLRenderTarget | null {
    return active?.sceneTarget ?? null;
}

/** The mounted pipeline, for checks and tuning. */
export function activePostPipeline(): PostPipeline | null {
    return active;
}

export default function PostFx({ settings }: { settings: BloomSettings }) {
    const gl = useThree((s) => s.gl);
    const pipeline = useMemo(
        () => createPostPipeline(gl, { ...settings }),
        // The settings are applied live below; only a new renderer rebuilds.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [gl],
    );
    useEffect(() => {
        Object.assign(pipeline.settings, settings);
        requestDraw(500);
    }, [pipeline, settings]);
    useEffect(() => {
        active = pipeline;
        requestDraw(1000);
        return () => {
            if (active === pipeline) active = null;
            pipeline.dispose();
            gl.setRenderTarget(null);
            requestDraw(1000);
        };
    }, [gl, pipeline]);
    useFrame(({ scene, camera }) => pipeline.render(scene, camera), 1);
    return null;
}
