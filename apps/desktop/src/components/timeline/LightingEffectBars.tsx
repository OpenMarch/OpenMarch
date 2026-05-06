import { useIsPlaying } from "@/context/IsPlayingContext";
import { LightingEffectWithMarchers } from "@/db-functions";
import {
    lightingEffectByIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
} from "@/hooks/queries/lighting/queries";
import { updateLightingEffectsMutationOptions } from "@/hooks/queries/lighting/mutations";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { parseEffectArgs } from "@openmarch/core";
import { useCallback, useMemo, useRef } from "react";
import clsx from "clsx";
import {
    effectBarPx,
    getSceneStartBeatPosition,
    getSceneTotalBeats,
    packEffectsIntoLanes,
    type OrderedSceneStart,
} from "./SceneTimeline.utils";
import type Beat from "@/global/classes/Beat";
import { compareBeats } from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";

const HEADER_GAP_PX = 4;
const LANE_HEIGHT_PX = 18;
const LANE_GAP_PX = 4;
const VERTICAL_PADDING_PX = 4;
const HANDLE_WIDTH_PX = 6;
const MIN_BAR_PX = 12;

type DragMode = "move" | "resize-left" | "resize-right";

type DragState = {
    effectId: number;
    mode: DragMode;
    originalStart: number;
    originalDuration: number;
    pointerDownX: number;
    sceneTotalBeats: number;
    /** scene-local px boundary positions (length = totalBeats + 1). */
    beatBoundaryPx: number[];
};

/**
 * Computes the scene-local px position of every beat boundary inside the scene
 * (index 0 .. totalBeats inclusive). Used to snap drags to whole-beat boundaries.
 */
function computeBeatBoundaryPx(
    beats: readonly Beat[],
    sceneStartPosition: number,
    totalBeats: number,
    pixelsPerSecond: number,
): number[] {
    const sorted = [...beats].sort(compareBeats);
    let sceneIdx = sorted.findIndex((b) => b.position === sceneStartPosition);
    if (sceneIdx < 0) {
        sceneIdx = sorted.findIndex((b) => b.position >= sceneStartPosition);
    }
    if (sceneIdx < 0) return [0];

    const positions: number[] = [0];
    let cursorMs = 0;
    for (
        let i = sceneIdx;
        i < sceneIdx + totalBeats && i < sorted.length;
        i++
    ) {
        cursorMs += Math.max(0, sorted[i]!.duration) * 1000;
        positions.push((cursorMs * pixelsPerSecond) / 1000);
    }
    return positions;
}

function findClosestBoundaryIndex(
    boundaryPx: readonly number[],
    targetPx: number,
): number {
    if (boundaryPx.length === 0) return 0;
    let bestIdx = 0;
    let bestDist = Math.abs(boundaryPx[0]! - targetPx);
    for (let i = 1; i < boundaryPx.length; i++) {
        const d = Math.abs(boundaryPx[i]! - targetPx);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return bestIdx;
}

type LightingEffectBarsProps = {
    sceneId: number;
    /** scene-local px width of the expanded container (excluding any outer padding). */
    widthPx: number;
    pixelsPerSecond: number;
    pages: readonly Page[];
    beats: readonly Beat[];
    orderedStarts: readonly OrderedSceneStart[];
    /** Notify parent of how many lanes are needed so the row can grow. */
    onLaneCountChange?: (laneCount: number) => void;
};

export function laneStackHeightPx(laneCount: number): number {
    if (laneCount <= 0) return 0;
    return laneCount * LANE_HEIGHT_PX + (laneCount - 1) * LANE_GAP_PX;
}

export function expandedSceneHeightPx(
    laneCount: number,
    headerHeightPx: number,
): number {
    return (
        VERTICAL_PADDING_PX * 2 +
        headerHeightPx +
        HEADER_GAP_PX +
        laneStackHeightPx(laneCount)
    );
}

export default function LightingEffectBars({
    sceneId,
    widthPx,
    pixelsPerSecond,
    pages,
    beats,
    orderedStarts,
    onLaneCountChange,
}: LightingEffectBarsProps) {
    const { isPlaying } = useIsPlaying()!;
    const { data: sceneData } = useQuery(
        lightingSceneDataByIdQueryOptions(sceneId),
    );
    const effectIds = useMemo(
        () => sceneData?.lightingEffectIds ?? [],
        [sceneData?.lightingEffectIds],
    );
    const effectQueries = useQueries({
        queries: effectIds.map((id) => lightingEffectByIdQueryOptions(id)),
    });

    const effects = (() => {
        const out: LightingEffectWithMarchers[] = [];
        for (const q of effectQueries) {
            if (q.data) out.push(q.data);
        }
        return out;
    })();

    const { mutate: updateEffect } = useMutation(
        updateLightingEffectsMutationOptions(),
    );

    const sceneStartBeatPos = useMemo(() => {
        if (!sceneData) return null;
        return getSceneStartBeatPosition(sceneData, pages);
    }, [sceneData, pages]);

    const sceneTotalBeats = useMemo(() => {
        if (!sceneData) return 0;
        return getSceneTotalBeats(sceneData, orderedStarts, pages);
    }, [sceneData, orderedStarts, pages]);

    const beatBoundaryPx = useMemo(() => {
        if (sceneStartBeatPos == null || sceneTotalBeats === 0) return [0];
        return computeBeatBoundaryPx(
            beats,
            sceneStartBeatPos,
            sceneTotalBeats,
            pixelsPerSecond,
        );
    }, [beats, sceneStartBeatPos, sceneTotalBeats, pixelsPerSecond]);

    const { placements, laneCount } = useMemo(
        () =>
            packEffectsIntoLanes(
                effects.map((e) => ({
                    id: e.id,
                    start_offset_beats: e.start_offset_beats,
                    duration_beats: e.duration_beats,
                })),
            ),
        [effects],
    );

    const lastReportedLanes = useRef<number>(-1);
    if (lastReportedLanes.current !== laneCount) {
        lastReportedLanes.current = laneCount;
        onLaneCountChange?.(laneCount);
    }

    const containerRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<DragState | null>(null);

    const onPointerMove = useCallback((ev: PointerEvent) => {
        const drag = dragState.current;
        if (!drag) return;
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseRelX = ev.clientX - rect.left;
        const closestIdx = findClosestBoundaryIndex(
            drag.beatBoundaryPx,
            mouseRelX,
        );
        const totalBeats = drag.sceneTotalBeats;

        let newStart = drag.originalStart;
        let newDuration = drag.originalDuration;

        if (drag.mode === "move") {
            const downIdx = findClosestBoundaryIndex(
                drag.beatBoundaryPx,
                drag.pointerDownX - rect.left,
            );
            const deltaBeats = closestIdx - downIdx;
            newStart = Math.max(
                0,
                Math.min(
                    totalBeats - drag.originalDuration,
                    drag.originalStart + deltaBeats,
                ),
            );
        } else if (drag.mode === "resize-right") {
            newDuration = Math.max(
                1,
                Math.min(
                    totalBeats - drag.originalStart,
                    closestIdx - drag.originalStart,
                ),
            );
        } else {
            const rightAnchor = drag.originalStart + drag.originalDuration;
            newStart = Math.max(0, Math.min(rightAnchor - 1, closestIdx));
            newDuration = rightAnchor - newStart;
        }

        const bar = container.querySelector<HTMLElement>(
            `[data-effect-bar-id="${drag.effectId}"]`,
        );
        if (bar) {
            const { leftPx, widthPx: barWidth } = barPxFromBoundary(
                drag.beatBoundaryPx,
                newStart,
                newDuration,
            );
            bar.style.left = `${leftPx}px`;
            bar.style.width = `${Math.max(MIN_BAR_PX, barWidth)}px`;
            bar.dataset.newStart = String(newStart);
            bar.dataset.newDuration = String(newDuration);
        }
    }, []);

    const onPointerUp = useCallback(() => {
        const drag = dragState.current;
        const container = containerRef.current;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        if (!drag || !container) {
            dragState.current = null;
            return;
        }
        const bar = container.querySelector<HTMLElement>(
            `[data-effect-bar-id="${drag.effectId}"]`,
        );
        if (bar) {
            const newStart = Number(bar.dataset.newStart);
            const newDuration = Number(bar.dataset.newDuration);
            delete bar.dataset.newStart;
            delete bar.dataset.newDuration;
            const startChanged =
                Number.isFinite(newStart) && newStart !== drag.originalStart;
            const durationChanged =
                Number.isFinite(newDuration) &&
                newDuration !== drag.originalDuration;
            if (startChanged || durationChanged) {
                updateEffect({
                    id: drag.effectId,
                    ...(startChanged ? { start_offset_beats: newStart } : {}),
                    ...(durationChanged ? { duration_beats: newDuration } : {}),
                });
            }
        }
        dragState.current = null;
    }, [onPointerMove, updateEffect]);

    const startDrag = useCallback(
        (
            ev: React.PointerEvent<HTMLElement>,
            effectId: number,
            mode: DragMode,
            originalStart: number,
            originalDuration: number,
        ) => {
            if (isPlaying) return;
            ev.preventDefault();
            ev.stopPropagation();
            dragState.current = {
                effectId,
                mode,
                originalStart,
                originalDuration,
                pointerDownX: ev.clientX,
                sceneTotalBeats,
                beatBoundaryPx,
            };
            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onPointerUp);
        },
        [
            beatBoundaryPx,
            isPlaying,
            onPointerMove,
            onPointerUp,
            sceneTotalBeats,
        ],
    );

    if (sceneStartBeatPos == null || sceneTotalBeats === 0) return null;

    return (
        <div
            ref={containerRef}
            className="relative w-full"
            style={{
                height: `${laneStackHeightPx(laneCount)}px`,
                width: `${widthPx}px`,
            }}
            aria-label={`Scene ${sceneId} effect bars`}
        >
            {placements.map((p) => {
                const effect = effects.find((e) => e.id === p.effectId);
                if (!effect) return null;
                const { leftPx, widthPx: barWidth } = effectBarPx(
                    beats,
                    sceneStartBeatPos,
                    p.startBeats,
                    p.durationBeats,
                    pixelsPerSecond,
                );
                const renderWidth = Math.max(MIN_BAR_PX, barWidth);
                const color = getEffectColor(effect);
                const isDarkEffectColor = isEffectColorDark(color);
                const borderColor = getEffectBorderColor(color);
                const handleHoverClass = isDarkEffectColor
                    ? "hover:bg-white/20"
                    : "hover:bg-black/20";
                const top = p.lane * (LANE_HEIGHT_PX + LANE_GAP_PX);
                return (
                    <div
                        key={p.effectId}
                        data-effect-bar-id={p.effectId}
                        className={clsx(
                            "border-stroke absolute overflow-clip rounded-[6px] border",
                            !isPlaying && "cursor-grab active:cursor-grabbing",
                        )}
                        style={{
                            top: `${top}px`,
                            left: `${leftPx}px`,
                            width: `${renderWidth}px`,
                            height: `${LANE_HEIGHT_PX}px`,
                            backgroundColor: color,
                            borderColor,
                        }}
                        role="button"
                        tabIndex={isPlaying ? -1 : 0}
                        aria-label={`Lighting effect ${effect.name ?? effect.id} starts at beat ${p.startBeats} for ${p.durationBeats} beats`}
                        onPointerDown={(e) =>
                            startDrag(
                                e,
                                effect.id,
                                "move",
                                effect.start_offset_beats,
                                effect.duration_beats,
                            )
                        }
                    >
                        {!isPlaying && (
                            <>
                                <button
                                    type="button"
                                    aria-label="Resize start"
                                    className={clsx(
                                        "absolute top-0 left-0 h-full cursor-ew-resize border-0 bg-transparent p-0",
                                        handleHoverClass,
                                    )}
                                    style={{ width: `${HANDLE_WIDTH_PX}px` }}
                                    onPointerDown={(e) =>
                                        startDrag(
                                            e,
                                            effect.id,
                                            "resize-left",
                                            effect.start_offset_beats,
                                            effect.duration_beats,
                                        )
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label="Resize end"
                                    className={clsx(
                                        "absolute top-0 right-0 h-full cursor-ew-resize border-0 bg-transparent p-0",
                                        handleHoverClass,
                                    )}
                                    style={{ width: `${HANDLE_WIDTH_PX}px` }}
                                    onPointerDown={(e) =>
                                        startDrag(
                                            e,
                                            effect.id,
                                            "resize-right",
                                            effect.start_offset_beats,
                                            effect.duration_beats,
                                        )
                                    }
                                />
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function barPxFromBoundary(
    boundaryPx: readonly number[],
    startBeats: number,
    durationBeats: number,
): { leftPx: number; widthPx: number } {
    const startIdx = Math.max(0, Math.min(boundaryPx.length - 1, startBeats));
    const endIdx = Math.max(
        0,
        Math.min(boundaryPx.length - 1, startBeats + durationBeats),
    );
    const leftPx = boundaryPx[startIdx] ?? 0;
    const rightPx = boundaryPx[endIdx] ?? leftPx;
    return { leftPx, widthPx: Math.max(0, rightPx - leftPx) };
}

const FALLBACK_COLOR = "#3b82f6";
const DARK_LUMINANCE_THRESHOLD = 0.35;
const LIGHT_EDGE_COLOR = "rgba(255, 255, 255, 0.6)";

function getEffectColor(effect: LightingEffectWithMarchers): string {
    try {
        const parsed = parseEffectArgs(effect.type, effect.args) as {
            color?: string;
        };
        if (parsed && typeof parsed.color === "string") return parsed.color;
    } catch {
        // fall through
    }
    return FALLBACK_COLOR;
}

function getEffectBorderColor(effectColor: string): string | undefined {
    if (isEffectColorDark(effectColor)) return LIGHT_EDGE_COLOR;
    return undefined;
}

function isEffectColorDark(effectColor: string): boolean {
    const rgb = parseColorToRgb(effectColor);
    if (!rgb) return false;
    const luminance = getRelativeLuminance(rgb);
    return luminance < DARK_LUMINANCE_THRESHOLD;
}

function parseColorToRgb(
    color: string,
): { r: number; g: number; b: number } | null {
    const value = color.trim();

    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const raw = hex[1]!;
        if (raw.length === 3) {
            return {
                r: Number.parseInt(raw[0]! + raw[0]!, 16),
                g: Number.parseInt(raw[1]! + raw[1]!, 16),
                b: Number.parseInt(raw[2]! + raw[2]!, 16),
            };
        }
        return {
            r: Number.parseInt(raw.slice(0, 2), 16),
            g: Number.parseInt(raw.slice(2, 4), 16),
            b: Number.parseInt(raw.slice(4, 6), 16),
        };
    }

    const rgb = value.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
    );
    if (rgb) {
        return {
            r: clampChannel(Number.parseFloat(rgb[1]!)),
            g: clampChannel(Number.parseFloat(rgb[2]!)),
            b: clampChannel(Number.parseFloat(rgb[3]!)),
        };
    }

    return null;
}

function clampChannel(channel: number): number {
    if (!Number.isFinite(channel)) return 0;
    return Math.max(0, Math.min(255, Math.round(channel)));
}

function getRelativeLuminance(rgb: {
    r: number;
    g: number;
    b: number;
}): number {
    const convert = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const r = convert(rgb.r);
    const g = convert(rgb.g);
    const b = convert(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
