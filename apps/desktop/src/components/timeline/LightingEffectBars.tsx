import { useIsPlaying } from "@/context/IsPlayingContext";
import {
    LightingEffectWithMarchers,
    type ModifiedLightingEffectArgs,
} from "@/db-functions";
import {
    lightingEffectByIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
} from "@/hooks/queries/lighting/queries";
import {
    updateLightingEffectsBatchMutationOptions,
    updateLightingEffectsMutationOptions,
} from "@/hooks/queries/lighting/mutations";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { parseEffectArgs } from "@openmarch/core";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { DotsSixIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";
import {
    barPxFromBoundary,
    computeBeatBoundaryPx,
    effectBarPx,
    findClosestBoundaryIndex,
    findOverlappingEffectsWithGroup,
    getSceneStartBeatPosition,
    getSceneTotalBeats,
    packEffectsIntoLanes,
    type OrderedSceneStart,
} from "./SceneTimeline.utils";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import {
    dataTransferHasLightingGroupDrag,
    getLightingGroupDragPayload,
    type LightingGroupDragPayload,
} from "@/utilities/lightingGroupEffectDnD";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";

const CLICK_MOVE_THRESHOLD_PX = 4;
const HEADER_GAP_PX = 4;
const LANE_HEIGHT_PX = 18;
const LANE_GAP_PX = 4;
const VERTICAL_PADDING_PX = 4;
const HANDLE_WIDTH_PX = 12;
const MIN_BAR_PX = 12;
const CENTER_DOT_MIN_BAR_WIDTH_PX = 28;

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
    const { t } = useTolgee();
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
    const { mutate: updateEffectsBatch } = useMutation(
        updateLightingEffectsBatchMutationOptions(),
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

    const [lightingGroupDragActive, setLightingGroupDragActive] =
        useState(false);
    const [dragHoverEffectId, setDragHoverEffectId] = useState<number | null>(
        null,
    );
    const [overlapPrompt, setOverlapPrompt] = useState<{
        groupId: number;
        targetEffectId: number;
        conflicts: readonly { id: number; name: string }[];
    } | null>(null);

    useEffect(() => {
        const onDragStartCaptured = (ev: DragEvent) => {
            if (
                ev.dataTransfer &&
                dataTransferHasLightingGroupDrag(ev.dataTransfer)
            )
                setLightingGroupDragActive(true);
        };
        const onDragTerminated = () => {
            setLightingGroupDragActive(false);
            setDragHoverEffectId(null);
        };
        document.addEventListener("dragstart", onDragStartCaptured, true);
        document.addEventListener("dragend", onDragTerminated, true);
        return () => {
            document.removeEventListener(
                "dragstart",
                onDragStartCaptured,
                true,
            );
            document.removeEventListener("dragend", onDragTerminated, true);
        };
    }, []);

    const dropGroupPayloadOnEffect = useCallback(
        (payload: LightingGroupDragPayload, targetEffectId: number) => {
            if (payload.sceneId !== sceneId) {
                toast.error(
                    t("workspace.lightDesigner.effects.dropWrongSceneToast") ??
                        "Cannot assign a group from another lighting scene.",
                );
                return;
            }
            const target = effects.find((e) => e.id === targetEffectId);
            if (!target) return;
            if (target.lighting_group_ids.includes(payload.groupId)) return;

            const effectNameFallback =
                t("workspace.lightDesigner.effects.unnamedFallback") ??
                "Lighting effect";

            const conflicts = findOverlappingEffectsWithGroup({
                effects,
                targetEffectId,
                groupId: payload.groupId,
                effectNameFallback,
            });

            if (conflicts.length === 0) {
                updateEffectsBatch([
                    {
                        id: target.id,
                        lighting_group_ids: [
                            ...new Set([
                                ...target.lighting_group_ids,
                                payload.groupId,
                            ]),
                        ],
                    },
                ]);
                return;
            }
            setOverlapPrompt({
                groupId: payload.groupId,
                targetEffectId,
                conflicts,
            });
        },
        [effects, sceneId, t, updateEffectsBatch],
    );

    const confirmOverlapAndMoveGroup = useCallback(() => {
        const prompt = overlapPrompt;
        if (prompt == null) return;
        const target = effects.find((e) => e.id === prompt.targetEffectId);
        if (!target) {
            setOverlapPrompt(null);
            return;
        }
        const updates: ModifiedLightingEffectArgs[] = [];
        for (const c of prompt.conflicts) {
            const e = effects.find((x) => x.id === c.id);
            if (!e) continue;
            updates.push({
                id: e.id,
                lighting_group_ids: e.lighting_group_ids.filter(
                    (g) => g !== prompt.groupId,
                ),
            });
        }
        updates.push({
            id: target.id,
            lighting_group_ids: [
                ...new Set([...target.lighting_group_ids, prompt.groupId]),
            ],
        });
        updateEffectsBatch(updates);
        setOverlapPrompt(null);
    }, [effects, overlapPrompt, updateEffectsBatch]);

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
                const { leftPx, widthPx: barWidth } = barPxFromBoundary(
                    effectDrag.beatBoundaryPx,
                    newStart,
                    newDuration,
                );
                bar.style.left = `${leftPx}px`;
                bar.style.width = `${Math.max(MIN_BAR_PX, barWidth)}px`;
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
                        updateEffect({
                            id: effectDrag.effectId,
                            ...(startChanged
                                ? { start_offset_beats: newStart }
                                : {}),
                            ...(durationChanged
                                ? { duration_beats: newDuration }
                                : {}),
                        });
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
        <>
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
                    const markerColorClass = isDarkEffectColor
                        ? "text-white/70"
                        : "text-black/45";
                    const showCenterDot =
                        renderWidth >= CENTER_DOT_MIN_BAR_WIDTH_PX;
                    const top = p.lane * (LANE_HEIGHT_PX + LANE_GAP_PX);
                    const isSelected =
                        selectedEffect?.effectId === effect.id &&
                        selectedEffect?.sceneId === sceneId;
                    return (
                        <div
                            key={p.effectId}
                            data-effect-bar-id={p.effectId}
                            className={clsx(
                                "border-stroke absolute overflow-clip rounded-[6px] border transition-[top] duration-200 ease-out",
                                !isPlaying &&
                                    "cursor-grab active:cursor-grabbing",
                                (isSelected ||
                                    (lightingGroupDragActive &&
                                        dragHoverEffectId === effect.id)) &&
                                    "ring-accent z-10 ring-2 ring-offset-1 ring-offset-transparent",
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
                            onDragOver={(e) => {
                                if (
                                    isPlaying ||
                                    !e.dataTransfer ||
                                    !dataTransferHasLightingGroupDrag(
                                        e.dataTransfer,
                                    )
                                )
                                    return;
                                e.preventDefault();
                                e.stopPropagation();
                                setDragHoverEffectId(effect.id);
                            }}
                            onDragLeave={(e) => {
                                const rel = e.relatedTarget as Node | null;
                                if (
                                    rel != null &&
                                    e.currentTarget.contains(rel)
                                ) {
                                    return;
                                }
                                setDragHoverEffectId((prev) =>
                                    prev === effect.id ? null : prev,
                                );
                            }}
                            onDrop={(e) => {
                                if (isPlaying) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const payload = getLightingGroupDragPayload(
                                    e.dataTransfer,
                                );
                                if (!payload) return;
                                dropGroupPayloadOnEffect(payload, effect.id);
                            }}
                        >
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
                            {!isPlaying && !lightingGroupDragActive && (
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

            <AlertDialog
                open={overlapPrompt != null}
                onOpenChange={(open) => {
                    if (!open) setOverlapPrompt(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        <T
                            keyName="workspace.lightDesigner.effects.groupOverlapConfirmTitle"
                            defaultValue="Group already affects an overlapping effect"
                        />
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <p>
                            <T
                                keyName="workspace.lightDesigner.effects.groupOverlapConfirmDescription"
                                defaultValue="Overlapping timing windows cannot reuse the same group. Remove this group from the conflicting effect(s) below and assign it here instead?"
                            />
                        </p>
                        {overlapPrompt != null &&
                        overlapPrompt.conflicts.length > 0 ? (
                            <ul className="border-stroke mt-16 list-inside list-disc border-t pt-16 text-[0.9375rem]">
                                {overlapPrompt.conflicts.map((c) => (
                                    <li key={c.id}>{c.name}</li>
                                ))}
                            </ul>
                        ) : null}
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8 pt-16">
                        <AlertDialogCancel>
                            <Button variant="secondary" size="compact">
                                <T
                                    keyName="workspace.lightDesigner.effects.groupOverlapCancel"
                                    defaultValue="Cancel"
                                />
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="primary"
                                size="compact"
                                onClick={() => confirmOverlapAndMoveGroup()}
                            >
                                <T
                                    keyName="workspace.lightDesigner.effects.groupOverlapConfirm"
                                    defaultValue="Move group"
                                />
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
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
