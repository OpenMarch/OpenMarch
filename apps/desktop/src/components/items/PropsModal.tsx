import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    BezierCurveIcon,
    CaretLeftIcon,
    CircleIcon,
    CubeIcon,
    EyeIcon,
    EyeSlashIcon,
    PencilSimpleIcon,
    PolygonIcon,
    SquareIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { itemGeometryAt } from "@openmarch/core";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
    Switch,
    UnitInput,
} from "@openmarch/ui";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { useTimingObjects } from "@/hooks";
import {
    allItemsQueryOptions,
    deleteItemsMutationOptions,
    itemGeometryQueryOptions,
    setItemGeometryMutationOptions,
    updateItemsMutationOptions,
} from "@/hooks/queries/useItems";
import type {
    getItems,
    LeadingEdge,
    OutlineType,
    SurfaceType,
} from "@/db-functions/items";
import { schema } from "@/global/database/db";
import {
    beatIndexesById,
    itemOutlineChanges,
    outlineWriteBeat,
} from "@/items/itemOutlineTimeline";

type ItemWithMarcher = Awaited<ReturnType<typeof getItems>>[number];

const OUTLINE_TOOLS: { id: OutlineType; icon: React.ReactNode }[] = [
    { id: "rectangle", icon: <SquareIcon size={24} /> },
    { id: "circle", icon: <CircleIcon size={24} /> },
    { id: "arc", icon: <BezierCurveIcon size={24} /> },
    { id: "polygon", icon: <PolygonIcon size={24} /> },
    { id: "freehand", icon: <PencilSimpleIcon size={24} /> },
];

const drillNumber = (item: ItemWithMarcher) =>
    `${item.marcher.drill_prefix}${item.marcher.drill_order}`;
const itemLabel = (item: ItemWithMarcher) =>
    item.marcher.name || drillNumber(item);

/**
 * Props in the show (C2.1, rebuilt from PR 1013): draw a new one at the playhead, hide them or
 * show their names on the field, and edit one's name, surface and Outline at the playhead.
 */
export default function PropsModal() {
    return (
        <SidebarModalLauncher
            contents={<PropListContents />}
            newContentId="props"
            buttonLabel={<CubeIcon size={24} />}
        />
    );
}

function ModalHeader({
    title,
    onBack,
}: {
    title: React.ReactNode;
    onBack?: () => void;
}) {
    const { t } = useTranslate();
    const { toggleOpen } = useSidebarModalStore();
    return (
        <header className="flex items-center justify-between gap-24">
            <div className="flex items-center gap-8">
                {onBack && (
                    <button
                        onClick={onBack}
                        aria-label={t("props.back")}
                        title={t("props.back")}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                )}
                <h4 className="text-h4 leading-none">{title}</h4>
            </div>
            <button
                onClick={toggleOpen}
                aria-label={t("props.close")}
                title={t("props.close")}
                className="hover:text-red duration-150 ease-out"
            >
                <XIcon size={24} />
            </button>
        </header>
    );
}

export function PropListContents() {
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ModalHeader title={<T keyName="props.title" />} />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <PropToolSelector />
                <div className="border-stroke border-t pt-12">
                    <PropList
                        onEdit={(item) =>
                            setContent(
                                <PropEditContents itemId={item.id} />,
                                "props",
                            )
                        }
                    />
                </div>
            </div>
        </div>
    );
}

function PropToolSelector() {
    const { t } = useTranslate();
    const setDrawingMode = useItemDrawingStore((s) => s.setDrawingMode);
    const { toggleOpen } = useSidebarModalStore();
    return (
        <div className="flex flex-col gap-12">
            <h5 className="text-text/70 text-sm font-medium">
                <T keyName="props.draw.title" />
            </h5>
            <div className="grid grid-cols-5 gap-8">
                {OUTLINE_TOOLS.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => {
                            setDrawingMode(tool.id);
                            // Close the panel to draw on the field
                            toggleOpen();
                        }}
                        className="bg-fg-2 hover:bg-fg-3 border-stroke rounded-6 flex flex-col items-center gap-4 border p-12 transition-colors"
                        title={t(`props.outline.${tool.id}`)}
                    >
                        {tool.icon}
                        <span className="text-xs">
                            {t(`props.outline.${tool.id}`)}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function PropList({ onEdit }: { onEdit: (item: ItemWithMarcher) => void }) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: items } = useQuery(allItemsQueryOptions());
    const deleteItems = useMutation(deleteItemsMutationOptions(queryClient));
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const propItems = useMemo(
        () => items?.filter((i) => i.kind === "prop") ?? [],
        [items],
    );

    if (propItems.length === 0)
        return (
            <p className="text-text/50 py-16 text-center">
                <T keyName="props.empty" />
            </p>
        );

    const nameShown = (id: number) =>
        uiSettings.propNameOverrides[id] ?? uiSettings.showPropNames;
    const allNamesShown = propItems.every((p) => nameShown(p.id));

    return (
        <div className="flex flex-col gap-8">
            <label className="text-text/70 flex items-center justify-between px-4 pb-4 text-sm">
                <T keyName="props.showNames" />
                <Switch
                    checked={allNamesShown}
                    onCheckedChange={() =>
                        setUiSettings({
                            ...uiSettings,
                            showPropNames: !allNamesShown,
                            propNameOverrides: {},
                        })
                    }
                />
            </label>
            {propItems.map((item) => {
                const hidden = !!uiSettings.hiddenPropIds[item.id];
                const visibilityLabel = hidden
                    ? t("props.show")
                    : t("props.hide");
                return (
                    <div
                        key={item.id}
                        className="bg-fg-2 border-stroke hover:bg-fg-3 rounded-6 flex cursor-pointer items-center justify-between border p-12 transition-colors"
                        onClick={() =>
                            setSelectedMarchers([
                                dbMarcherToMarcher(item.marcher),
                            ])
                        }
                    >
                        <div className="flex items-center gap-8">
                            <button
                                title={visibilityLabel}
                                aria-label={visibilityLabel}
                                className="text-text/50 hover:text-text shrink-0 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setUiSettings({
                                        ...uiSettings,
                                        hiddenPropIds: {
                                            ...uiSettings.hiddenPropIds,
                                            [item.id]: !hidden,
                                        },
                                    });
                                }}
                            >
                                {hidden ? (
                                    <EyeSlashIcon size={16} />
                                ) : (
                                    <EyeIcon size={16} />
                                )}
                            </button>
                            <div className="flex flex-col">
                                <span className="font-medium">
                                    {itemLabel(item)}
                                </span>
                                <span className="text-text/50 text-sm">
                                    {item.surface_type &&
                                        t(`props.surface.${item.surface_type}`)}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <Button
                                variant="secondary"
                                size="compact"
                                aria-label={t("props.edit")}
                                title={t("props.edit")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(item);
                                }}
                            >
                                <PencilSimpleIcon size={16} />
                            </Button>
                            <Button
                                variant="red"
                                size="compact"
                                aria-label={t("props.delete")}
                                title={t("props.delete")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Undoable, like deleting marchers
                                    deleteItems.mutate(
                                        new Set([item.marcher_id]),
                                    );
                                }}
                            >
                                <TrashIcon size={16} />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function PropEditContents({ itemId }: { itemId: number }) {
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ModalHeader
                title={<T keyName="props.editTitle" />}
                onBack={() => setContent(<PropListContents />, "props")}
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <PropEditor itemId={itemId} />
            </div>
        </div>
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

function PropEditor({ itemId }: { itemId: number }) {
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

    const item = items?.find((i) => i.id === itemId);
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
                            onCommit={(width) => writeOutline({ width })}
                        />
                        <CommitNumber
                            label={t("props.depth")}
                            unit={t("props.units.meters")}
                            min={0.01}
                            step={0.1}
                            value={shown.depth}
                            onCommit={(depth) => writeOutline({ depth })}
                        />
                        <CommitNumber
                            label={t("props.height")}
                            unit={t("props.units.meters")}
                            min={0}
                            step={0.1}
                            value={shown.height}
                            onCommit={(height) => writeOutline({ height })}
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
