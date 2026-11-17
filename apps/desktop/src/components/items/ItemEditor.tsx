import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { itemGeometryAt } from "@openmarch/core";
import { rgbaToHex } from "@uiw/react-color";
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
    Switch,
    UnitInput,
} from "@openmarch/ui";
import ColorPickerMini from "@/components/ui/ColorPickerMini";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimingObjects } from "@/hooks";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
    setItemGeometryMutationOptions,
    updateItemsMutationOptions,
} from "@/hooks/queries/useItems";
import type { LeadingEdge, SurfaceType } from "@/db-functions/items";
import { schema } from "@/global/database/db";
import {
    beatIndexesById,
    itemOutlineChanges,
    outlineWriteBeat,
} from "@/items/itemOutlineTimeline";
import { parsePropColor, propColorToString } from "@/items/propColor";
import EquipmentModelControl from "@/components/frontEnsemble/EquipmentModelControl";
import { showAssetsQueryOptions } from "@/hooks/queries/useShowAssets";
import {
    libraryModels,
    proportionalSize,
    type ModelSide,
} from "@/showAssets/libraryModels";
import { drillNumber, type ItemWithMarcher } from "./ItemRows";

/**
 * The color of `items` (one prop, or the props selected on the field), on the field and in the 3D
 * View. Setting or clearing it is one undo step for all of them. The button shows the color's hex,
 * "None", or "Mixed" when the props differ.
 */
export function PropColorControl({
    items,
}: {
    items: readonly ItemWithMarcher[];
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const updateItems = useMutation(updateItemsMutationOptions(queryClient));
    const stored = items.map((item) =>
        propColorToString(parsePropColor(item.color)),
    );
    const mixed = stored.some((c) => c !== stored[0]);
    const shared = mixed ? null : stored[0];
    const initialColor = useMemo(() => parsePropColor(shared), [shared]);
    return (
        <ColorPickerMini
            label={
                initialColor
                    ? rgbaToHex(initialColor).toUpperCase()
                    : mixed
                      ? t("props.colorMixed")
                      : t("props.colorNone")
            }
            initialColor={initialColor}
            onBlur={(color) => {
                const next = propColorToString(color);
                const changed = items.filter((_, i) => stored[i] !== next);
                if (changed.length === 0) return;
                updateItems.mutate(
                    changed.map((item) => ({ itemId: item.id, color: next })),
                );
            }}
            className="px-0"
        />
    );
}

/** A number field that commits on blur or Enter, and shows the stored value again otherwise */
function CommitNumber({
    value,
    unit,
    min,
    step,
    label,
    onCommit,
}: {
    value: number;
    unit: string;
    min: number;
    step: number;
    label: string;
    onCommit: (value: number) => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const commit = () => {
        if (draft === null) return;
        const parsed = Number(draft);
        setDraft(null);
        if (Number.isFinite(parsed) && parsed >= min && parsed !== value)
            onCommit(parsed);
    };
    return (
        <label className="flex flex-col gap-4 text-sm">
            <span className="text-text/70">{label}</span>
            <UnitInput
                compact
                unit={unit}
                step={step}
                min={min}
                aria-label={label}
                value={draft ?? String(Number(value.toFixed(3)))}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
            />
        </label>
    );
}

/**
 * An item's edit view, shared by the Props and Front ensemble panels: its name, its model (for
 * equipment), its lock, its color and surface (for a prop), and its Outline at the playhead.
 */
export function ItemEditor({ itemId }: { itemId: number }) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: rows } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects()!;
    const beat = useTimelineSelectionStore(displayedBeat);
    const updateItems = useMutation(updateItemsMutationOptions(queryClient));
    const setGeometry = useMutation(
        setItemGeometryMutationOptions(queryClient),
    );
    const [name, setName] = useState<string | null>(null);
    const { data: assets } = useQuery(showAssetsQueryOptions());
    const library = useMemo(() => libraryModels(assets), [assets]);

    const item = items?.find((i) => i.id === itemId);
    // An imported model's prop keeps its proportions: its sides change together (#1078)
    const model = item?.model ? library.get(item.model) : undefined;
    const changes = useMemo(
        () =>
            item && rows
                ? (itemOutlineChanges({
                      items: [item],
                      geometry: rows,
                      beatIndexes: beatIndexesById(beats),
                  }).get(item.marcher_id) ?? [])
                : [],
        [item, rows, beats],
    );
    if (!item) return null;

    const shown = itemGeometryAt(changes, beat);
    const writeBeat = outlineWriteBeat(beats, beat);
    const existing = rows?.find(
        (r) => r.item_id === item.id && r.beat_id === writeBeat?.id,
    );

    const writeOutline = (patch: {
        width?: number;
        depth?: number;
        height?: number;
        rotation?: number;
        transitionLength?: number;
        rollsOutFrom?: LeadingEdge | null;
    }) => {
        if (!shown || !writeBeat) return;
        setGeometry.mutate({
            itemId: item.id,
            beatId: writeBeat.id,
            geometry: {
                outlineType: shown.outlineType,
                customOutline: shown.customOutline ?? null,
                width: patch.width ?? shown.width,
                depth: patch.depth ?? shown.depth,
                height: patch.height ?? shown.height,
                rotation: patch.rotation ?? shown.rotation,
                transitionLength:
                    patch.transitionLength ?? existing?.transition_length ?? 1,
                rollsOutFrom:
                    patch.rollsOutFrom !== undefined
                        ? patch.rollsOutFrom
                        : shown.rollsOut
                          ? shown.leadingEdge
                          : null,
            },
        });
    };

    /** Sets one side: with a model, the other two follow in its proportions. */
    const writeSide = (side: ModelSide, value: number) =>
        writeOutline(
            (model && proportionalSize(model.sidecar.sizeM, side, value)) ?? {
                [side]: value,
            },
        );

    const commitName = () => {
        if (name === null) return;
        const next = name.trim() || null;
        setName(null);
        if (next !== item.marcher.name)
            updateItems.mutate([{ itemId: item.id, name: next }]);
    };

    return (
        <div className="flex flex-col gap-16">
            <label className="flex flex-col gap-4 text-sm">
                <span className="text-text/70">
                    <T keyName="props.name" />
                </span>
                <Input
                    compact
                    value={name ?? item.marcher.name ?? ""}
                    placeholder={drillNumber(item)}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitName();
                    }}
                />
            </label>
            <EquipmentModelControl item={item} />
            <label className="flex items-center justify-between gap-12 text-sm">
                <span className="flex flex-col gap-2">
                    <span className="text-text/70 flex items-center gap-4">
                        <LockSimpleIcon size={12} aria-hidden />
                        <T keyName="props.lockLabel" />
                    </span>
                    <span className="text-text/50">
                        <T keyName="props.lockHint" />
                    </span>
                </span>
                <Switch
                    aria-label={t("props.lockLabel")}
                    checked={item.locked}
                    onCheckedChange={(locked) =>
                        updateItems.mutate([
                            {
                                itemId: item.id,
                                locked,
                                // Locking keeps it where it is at the playhead, not at its home
                                lockAtBeat:
                                    useTimelineSelectionStore.getState()
                                        .playheadBeat,
                            },
                        ])
                    }
                />
            </label>
            {item.kind === "prop" && (
                <div className="flex flex-col gap-4 text-sm">
                    <span className="text-text/70">
                        <T keyName="props.color" />
                    </span>
                    <PropColorControl items={[item]} />
                </div>
            )}
            {item.kind === "prop" && (
                <label className="flex flex-col gap-4 text-sm">
                    <span className="text-text/70">
                        <T keyName="props.surfaceLabel" />
                    </span>
                    <Select
                        value={item.surface_type ?? "obstacle"}
                        onValueChange={(value) =>
                            updateItems.mutate([
                                {
                                    itemId: item.id,
                                    surfaceType: value as SurfaceType,
                                },
                            ])
                        }
                    >
                        <SelectTriggerCompact
                            label={t(
                                `props.surface.${item.surface_type ?? "obstacle"}`,
                            )}
                        />
                        <SelectContent>
                            {schema.SURFACE_TYPES.map((surface) => (
                                <SelectItem key={surface} value={surface}>
                                    {t(`props.surface.${surface}`)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
            )}
            <div className="border-stroke flex flex-col gap-12 border-t pt-12">
                <h5 className="text-text/70 text-sm font-medium">
                    {writeBeat ? (
                        <T
                            keyName="props.outlineFrom"
                            params={{ count: writeBeat.index }}
                        />
                    ) : (
                        <T keyName="props.outlineTitle" />
                    )}
                </h5>
                {shown ? (
                    <div className="grid grid-cols-2 gap-12">
                        <CommitNumber
                            label={t("props.width")}
                            unit={t("props.units.meters")}
                            min={0.01}
                            step={0.1}
                            value={shown.width}
                            onCommit={(width) => writeSide("width", width)}
                        />
                        <CommitNumber
                            label={t("props.depth")}
                            unit={t("props.units.meters")}
                            min={0.01}
                            step={0.1}
                            value={shown.depth}
                            onCommit={(depth) => writeSide("depth", depth)}
                        />
                        <CommitNumber
                            label={t("props.height")}
                            unit={t("props.units.meters")}
                            min={0}
                            step={0.1}
                            value={shown.height}
                            onCommit={(height) => writeSide("height", height)}
                        />
                        <CommitNumber
                            label={t("props.rotation")}
                            unit="°"
                            min={-360}
                            step={15}
                            value={shown.rotation}
                            onCommit={(rotation) => writeOutline({ rotation })}
                        />
                        <CommitNumber
                            label={t("props.transition")}
                            unit={t("props.counts")}
                            min={1}
                            step={1}
                            value={existing?.transition_length ?? 1}
                            onCommit={(transitionLength) =>
                                writeOutline({
                                    transitionLength:
                                        Math.round(transitionLength),
                                })
                            }
                        />
                        {model && (
                            <p
                                className="text-sub text-text-subtitle col-span-2"
                                data-testid="item-keeps-proportions"
                            >
                                <T keyName="props.keepsProportions" />
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-text/50 text-sm">
                        <T keyName="props.offField" />
                    </p>
                )}
                {shown && item.surface_type === "floor" && (
                    <label className="flex flex-col gap-4 text-sm">
                        <span className="text-text/70">
                            <T keyName="props.rollOut.label" />
                        </span>
                        <Select
                            value={
                                shown.rollsOut
                                    ? (shown.leadingEdge ?? "none")
                                    : "none"
                            }
                            onValueChange={(value) =>
                                writeOutline({
                                    rollsOutFrom:
                                        value === "none"
                                            ? null
                                            : (value as LeadingEdge),
                                })
                            }
                        >
                            <SelectTriggerCompact
                                label={t(
                                    `props.rollOut.${shown.rollsOut ? (shown.leadingEdge ?? "none") : "none"}`,
                                )}
                            />
                            <SelectContent>
                                {(
                                    ["none", ...schema.LEADING_EDGES] as const
                                ).map((edge) => (
                                    <SelectItem key={edge} value={edge}>
                                        {t(`props.rollOut.${edge}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                )}
            </div>
        </div>
    );
}
