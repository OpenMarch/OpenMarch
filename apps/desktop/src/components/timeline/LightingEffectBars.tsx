import { useIsPlaying } from "@/context/IsPlayingContext";
import { LightingEffectWithMarchers } from "@/db-functions";
import {
    lightingEffectByIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
} from "@/hooks/queries/lighting/queries";
import { updateLightingEffectsMutationOptions } from "@/hooks/queries/lighting/mutations";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import {
    normalizeWipeDirectionDegrees,
    parseEffectArgs,
} from "@openmarch/core";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type CSSProperties,
} from "react";
import clsx from "clsx";
import {
    ArrowRightIcon,
    DotsSixIcon,
    DotsSixVerticalIcon,
} from "@phosphor-icons/react";
import {
    barPxFromBoundary,
    computeBeatBoundaryPx,
    effectBarPx,
    findClosestBoundaryIndex,
    getSceneStartBeatPosition,
    getSceneTotalBeats,
    packEffectsIntoLanes,
    type OrderedSceneStart,
} from "./SceneTimeline.utils";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";

const CLICK_MOVE_THRESHOLD_PX = 4;
const HEADER_GAP_PX = 4;
const LANE_HEIGHT_PX = 18;
const LANE_GAP_PX = 4;
const VERTICAL_PADDING_PX = 4;
const HANDLE_WIDTH_PX = 12;
const MIN_BAR_PX = 12;
const CENTER_DOT_MIN_BAR_WIDTH_PX = 28;
const WIPE_START_COLOR = "#000000";
const WIPE_ARROW_SIZE_PX = 9;
const WIPE_ARROW_SPACING_PX = 20;
const WIPE_ARROW_EDGE_PAD_PX = 16;

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

/** Syncs drag preview position on the bar element (inline styles bypass React). */
function applyEffectBarBoundaryStyles(
    bar: HTMLElement,
    beatBoundaryPx: number[],
    startBeats: number,
    durationBeats: number,
) {
    const { leftPx, widthPx: barWidth } = barPxFromBoundary(
        beatBoundaryPx,
        startBeats,
        durationBeats,
    );
    bar.style.left = `${leftPx}px`;
    bar.style.width = `${Math.max(MIN_BAR_PX, barWidth)}px`;
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
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const selectEffect = useLightDesignerSelectedEffectStore.use.selectEffect();
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

    useEffect(() => {
        onLaneCountChange?.(laneCount);
    }, [laneCount, onLaneCountChange]);

    const containerRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<DragState | null>(null);

    const onPointerMove = useCallback((ev: PointerEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const effectDrag = dragState.current;
        if (effectDrag) {
            const mouseRelX = ev.clientX - rect.left;
            const closestIdx = findClosestBoundaryIndex(
                effectDrag.beatBoundaryPx,
                mouseRelX,
            );
            const totalBeats = effectDrag.sceneTotalBeats;

            let newStart = effectDrag.originalStart;
            let newDuration = effectDrag.originalDuration;

            if (effectDrag.mode === "move") {
                const downIdx = findClosestBoundaryIndex(
                    effectDrag.beatBoundaryPx,
                    effectDrag.pointerDownX - rect.left,
                );
                const deltaBeats = closestIdx - downIdx;
                newStart = Math.max(
                    0,
                    Math.min(
                        totalBeats - effectDrag.originalDuration,
                        effectDrag.originalStart + deltaBeats,
                    ),
                );
            } else if (effectDrag.mode === "resize-right") {
                newDuration = Math.max(
                    1,
                    Math.min(
                        totalBeats - effectDrag.originalStart,
                        closestIdx - effectDrag.originalStart,
                    ),
                );
            } else {
                const rightAnchor =
                    effectDrag.originalStart + effectDrag.originalDuration;
                newStart = Math.max(0, Math.min(rightAnchor - 1, closestIdx));
                newDuration = rightAnchor - newStart;
            }

            const bar = container.querySelector<HTMLElement>(
                `[data-effect-bar-id="${effectDrag.effectId}"]`,
            );
            if (bar) {
                applyEffectBarBoundaryStyles(
                    bar,
                    effectDrag.beatBoundaryPx,
                    newStart,
                    newDuration,
                );
                bar.dataset.newStart = String(newStart);
                bar.dataset.newDuration = String(newDuration);
            }
            return;
        }
    }, []);

    const onPointerUp = useCallback(
        (ev: PointerEvent) => {
            const effectDrag = dragState.current;
            const container = containerRef.current;
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
            if (effectDrag && container) {
                const bar = container.querySelector<HTMLElement>(
                    `[data-effect-bar-id="${effectDrag.effectId}"]`,
                );
                if (bar) {
                    const newStart = Number(bar.dataset.newStart);
                    const newDuration = Number(bar.dataset.newDuration);
                    delete bar.dataset.newStart;
                    delete bar.dataset.newDuration;
                    const startChanged =
                        Number.isFinite(newStart) &&
                        newStart !== effectDrag.originalStart;
                    const durationChanged =
                        Number.isFinite(newDuration) &&
                        newDuration !== effectDrag.originalDuration;
                    if (startChanged || durationChanged) {
                        const dragSnapshot = effectDrag;
                        updateEffect(
                            {
                                id: effectDrag.effectId,
                                ...(startChanged
                                    ? { start_offset_beats: newStart }
                                    : {}),
                                ...(durationChanged
                                    ? { duration_beats: newDuration }
                                    : {}),
                            },
                            {
                                onError: () => {
                                    applyEffectBarBoundaryStyles(
                                        bar,
                                        dragSnapshot.beatBoundaryPx,
                                        dragSnapshot.originalStart,
                                        dragSnapshot.originalDuration,
                                    );
                                },
                            },
                        );
                    } else if (
                        !isPlaying &&
                        Math.abs(ev.clientX - effectDrag.pointerDownX) <
                            CLICK_MOVE_THRESHOLD_PX
                    ) {
                        selectEffect({
                            effectId: effectDrag.effectId,
                            sceneId,
                        });
                    }
                }
                dragState.current = null;
                return;
            }

            dragState.current = null;
        },
        [isPlaying, onPointerMove, sceneId, selectEffect, updateEffect],
    );

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
                // Wipe always starts on black, so prefer a light edge; otherwise a
                // dark border-stroke reads as a black cap on light end colors.
                const borderColor =
                    effect.type === "wipe"
                        ? LIGHT_EDGE_COLOR
                        : getEffectBorderColor(color);
                const markerColorClass = isDarkEffectColor
                    ? "text-white/70"
                    : "text-black/45";
                const showCenterDot =
                    renderWidth >= CENTER_DOT_MIN_BAR_WIDTH_PX;
                const top = p.lane * (LANE_HEIGHT_PX + LANE_GAP_PX);
                const isSelected =
                    selectedEffect?.effectId === effect.id &&
                    selectedEffect?.sceneId === sceneId;
                const barBackground = getEffectBarBackground(effect, color);
                const wipeDirectionDegrees =
                    effect.type === "wipe"
                        ? getWipeDirectionDegrees(effect)
                        : 0;
                const wipeArrowPositions =
                    effect.type === "wipe"
                        ? getWipeArrowPositions(renderWidth)
                        : [];
                return (
                    <div
                        key={p.effectId}
                        data-effect-bar-id={p.effectId}
                        className={clsx(
                            "border-stroke absolute overflow-clip rounded-[6px] border transition-[top] duration-200 ease-out",
                            !isPlaying && "cursor-grab active:cursor-grabbing",
                            isSelected &&
                                "ring-accent z-10 ring-2 ring-offset-1 ring-offset-transparent",
                        )}
                        style={{
                            top: `${top}px`,
                            left: `${leftPx}px`,
                            width: `${renderWidth}px`,
                            height: `${LANE_HEIGHT_PX}px`,
                            ...barBackground,
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
                        {effect.type === "wipe" &&
                            wipeArrowPositions.map((xPx) => {
                                const t =
                                    renderWidth <= 0 ? 0 : xPx / renderWidth;
                                const onDark = isEffectColorDark(
                                    lerpHexTowardColor(
                                        WIPE_START_COLOR,
                                        color,
                                        t,
                                    ),
                                );
                                return (
                                    <ArrowRightIcon
                                        key={xPx}
                                        size={WIPE_ARROW_SIZE_PX}
                                        weight="bold"
                                        className="pointer-events-none absolute top-1/2"
                                        style={{
                                            left: `${xPx}px`,
                                            color: onDark
                                                ? "rgba(255, 255, 255, 0.9)"
                                                : "rgba(0, 0, 0, 0.75)",
                                            // Outline in the opposite tone so end
                                            // arrows don't read as solid white/black caps.
                                            filter: onDark
                                                ? "drop-shadow(0 0 0.65px #000) drop-shadow(0 0 0.65px #000)"
                                                : "drop-shadow(0 0 0.65px #fff) drop-shadow(0 0 0.65px #fff)",
                                            transform: `translate(-50%, -50%) rotate(${-wipeDirectionDegrees}deg)`,
                                        }}
                                        aria-hidden
                                    />
                                );
                            })}
                        {!isPlaying && (
                            <div
                                className="pointer-events-none absolute inset-0"
                                aria-hidden
                            >
                                <DotsSixVerticalIcon
                                    size={10}
                                    weight="bold"
                                    className={clsx(
                                        "absolute top-1/2 left-[1px] -translate-y-1/2",
                                        markerColorClass,
                                    )}
                                    aria-hidden
                                />
                                <DotsSixVerticalIcon
                                    size={10}
                                    weight="bold"
                                    className={clsx(
                                        "absolute top-1/2 right-[1px] -translate-y-1/2",
                                        markerColorClass,
                                    )}
                                    aria-hidden
                                />
                                {showCenterDot && (
                                    <DotsSixIcon
                                        size={10}
                                        weight="bold"
                                        className={clsx(
                                            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                                            markerColorClass,
                                        )}
                                        aria-hidden
                                    />
                                )}
                            </div>
                        )}
                        {!isPlaying && (
                            <>
                                <button
                                    type="button"
                                    aria-label="Resize start"
                                    className={clsx(
                                        "absolute top-0 left-0 h-full cursor-ew-resize border-0 bg-transparent p-0",
                                    )}
                                    style={{
                                        width: `${HANDLE_WIDTH_PX}px`,
                                    }}
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
                                    )}
                                    style={{
                                        width: `${HANDLE_WIDTH_PX}px`,
                                    }}
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

const FALLBACK_COLOR = "#3b82f6";
const FALLBACK_END_COLOR = "#ffffff";
const DARK_LUMINANCE_THRESHOLD = 0.35;
const LIGHT_EDGE_COLOR = "rgba(255, 255, 255, 0.6)";

function getEffectColor(effect: LightingEffectWithMarchers): string {
    try {
        const parsed = parseEffectArgs(effect.type, effect.args) as {
            color?: string;
            colors?: string[];
            startColor?: string;
        };
        if (parsed.colors?.length) return parsed.colors[0]!;
        if (typeof parsed.color === "string") return parsed.color;
        if (typeof parsed.startColor === "string") return parsed.startColor;
    } catch {
        // fall through
    }
    return FALLBACK_COLOR;
}

function getEffectEndColor(effect: LightingEffectWithMarchers): string {
    try {
        const parsed = parseEffectArgs(effect.type, effect.args) as {
            endColor?: string;
        };
        if (typeof parsed.endColor === "string") return parsed.endColor;
    } catch {
        // fall through
    }
    return FALLBACK_END_COLOR;
}

/** CSS fill styles for the timeline bar based on effect type. */
function getEffectBarBackground(
    effect: LightingEffectWithMarchers,
    representativeColor: string,
): CSSProperties {
    switch (effect.type) {
        case "flicker": {
            // Four rows of square cells across the bar height.
            const cellPx = LANE_HEIGHT_PX / 4;
            return {
                backgroundImage: `repeating-conic-gradient(${representativeColor} 0% 25%, #000000 0% 50%)`,
                backgroundSize: `${cellPx * 2}px ${cellPx * 2}px`,
            };
        }
        case "fade": {
            const endColor = getEffectEndColor(effect);
            return {
                backgroundImage: `linear-gradient(to right, ${representativeColor}, ${endColor})`,
            };
        }
        case "wipe":
            return {
                backgroundColor: WIPE_START_COLOR,
                backgroundImage: `linear-gradient(to right, ${WIPE_START_COLOR} 0%, ${representativeColor} 100%)`,
            };
        case "solid":
        default:
            return { backgroundColor: representativeColor };
    }
}

function getWipeDirectionDegrees(effect: LightingEffectWithMarchers): number {
    try {
        const parsed = parseEffectArgs(effect.type, effect.args) as {
            directionDegrees?: number;
        };
        if (typeof parsed.directionDegrees === "number") {
            return normalizeWipeDirectionDegrees(parsed.directionDegrees);
        }
    } catch {
        // fall through
    }
    return 0;
}

/** Evenly spaced x positions for wipe direction arrows along the bar. */
function getWipeArrowPositions(widthPx: number): number[] {
    const start = WIPE_ARROW_EDGE_PAD_PX;
    const end = widthPx - WIPE_ARROW_EDGE_PAD_PX;
    if (end < start) {
        if (widthPx >= WIPE_ARROW_SIZE_PX) return [widthPx / 2];
        return [];
    }
    const positions: number[] = [];
    for (let x = start; x <= end + 0.5; x += WIPE_ARROW_SPACING_PX) {
        positions.push(Math.round(x));
    }
    return positions;
}

/** Linearly interpolate from `fromHex` toward `toHex` by t in [0, 1]. */
function lerpHexTowardColor(fromHex: string, toHex: string, t: number): string {
    const from = parseColorToRgb(fromHex);
    const to = parseColorToRgb(toHex);
    if (!from || !to) return toHex;
    const clamped = Math.min(1, Math.max(0, t));
    return `rgb(${Math.round(from.r + (to.r - from.r) * clamped)}, ${Math.round(from.g + (to.g - from.g) * clamped)}, ${Math.round(from.b + (to.b - from.b) * clamped)})`;
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
