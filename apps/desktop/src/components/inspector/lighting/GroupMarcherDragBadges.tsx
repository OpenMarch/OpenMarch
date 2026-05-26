import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import Marcher from "@/global/classes/Marcher";
import {
    allMarchersQueryOptions,
    allTagsQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
} from "@/hooks/queries";
import {
    getFamiliesInShow,
    getMarcherIdsByFamily,
    getMarcherIdsBySectionName,
    sectionsFromMarchers,
} from "@/utilities/lightingGroupMarcherSelection";
import {
    setLightingGroupMarcherCollectionDragData,
    type LightingGroupMarcherCollectionSourceType,
} from "@/utilities/lightingGroupEffectDnD";
import { Badge } from "@openmarch/ui";
import { CaretDownIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import clsx from "clsx";
import {
    useState,
    type DragEvent,
    type MouseEvent,
    type ReactNode,
} from "react";

function MarcherCollectionDragBadge({
    sourceType,
    label,
    marcherIds,
    variant,
    children,
    className,
    fullWidth = false,
    onMouseDown,
    onDragStart,
}: {
    sourceType: LightingGroupMarcherCollectionSourceType;
    label: string;
    marcherIds: number[];
    variant: "primary" | "secondary" | "disabled";
    fullWidth?: boolean;
    children: ReactNode;
    className?: string;
    onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
    onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
}) {
    const isDraggable = marcherIds.length > 0;

    const handleDragStartInternal = (e: DragEvent<HTMLButtonElement>) => {
        setLightingGroupMarcherCollectionDragData(e.dataTransfer, {
            sourceType,
            label,
            marcherIds,
        });
        onDragStart?.(e);
    };

    const badgeVariant = variant === "disabled" ? "secondary" : variant;

    return (
        <button
            type="button"
            className={clsx("cursor-grab active:cursor-grabbing", className)}
            draggable={isDraggable}
            onDragStart={handleDragStartInternal}
            onMouseDown={onMouseDown}
            aria-label={label}
        >
            <Badge
                variant={badgeVariant}
                className={clsx("py-4", {
                    "text-text-disabled cursor-default italic":
                        variant === "disabled",
                    "w-full": fullWidth,
                })}
            >
                <span className="inline-flex items-center gap-6">
                    {isDraggable ? (
                        <DotsSixVerticalIcon
                            size={14}
                            className={clsx("shrink-0", {
                                "text-text-invert": variant === "primary",
                            })}
                            weight="bold"
                            aria-hidden
                        />
                    ) : null}
                    {children}
                </span>
            </Badge>
        </button>
    );
}

function CollectionDropdownBadge({
    label,
    items,
    disabled = false,
}: {
    label: ReactNode;
    items: Array<{
        key: string;
        label: ReactNode;
        marcherIds: number[];
        sourceType: LightingGroupMarcherCollectionSourceType;
    }>;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dropdown.Root
            open={disabled ? false : open}
            onOpenChange={(nextOpen) => {
                if (disabled) return;
                setOpen(nextOpen);
            }}
        >
            <Dropdown.Trigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    className={clsx({
                        "cursor-not-allowed opacity-60": disabled,
                    })}
                >
                    <Badge
                        variant="secondary"
                        className="h-full w-full gap-6 py-4"
                    >
                        {label}
                        <CaretDownIcon size={14} aria-hidden />
                    </Badge>
                </button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
                <Dropdown.Content
                    collisionPadding={8}
                    className="bg-modal text-text rounded-8 border-stroke backdrop-blur-32 z-[52] inline-block max-h-[min(40vh,var(--radix-dropdown-menu-content-available-height))] min-w-max overflow-y-auto border p-8 shadow-xl"
                >
                    {items
                        .filter((item) => item.marcherIds.length > 0)
                        .map((item) => (
                            <Dropdown.Item
                                key={item.key}
                                asChild
                                onSelect={(e) => e.preventDefault()}
                            >
                                <MarcherCollectionDragBadge
                                    sourceType={item.sourceType}
                                    label={
                                        typeof item.label === "string"
                                            ? item.label
                                            : `${item.sourceType}-${item.key}`
                                    }
                                    marcherIds={item.marcherIds}
                                    variant="secondary"
                                    className="text-text hover:bg-overlay rounded-8 w-full px-8 py-4 text-left outline-hidden"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onDragStart={() => {
                                        window.setTimeout(
                                            () => setOpen(false),
                                            0,
                                        );
                                    }}
                                >
                                    {item.label}
                                </MarcherCollectionDragBadge>
                            </Dropdown.Item>
                        ))}
                </Dropdown.Content>
            </Dropdown.Portal>
        </Dropdown.Root>
    );
}

export default function GroupMarcherDragBadges() {
    const { t } = useTolgee();
    const { selectedMarchers } = useSelectedMarchers()!;
    const { data: marchers = [] } = useQuery(allMarchersQueryOptions());
    const { data: tags = [] } = useQuery(allTagsQueryOptions());
    const { data: marcherIdsByTagIdMap } = useQuery(
        marcherIdsForAllTagIdsQueryOptions(),
    );

    const selectedIds = selectedMarchers.map((marcher) => marcher.id);
    const sections = sectionsFromMarchers(marchers as Marcher[]);
    const families = getFamiliesInShow();

    const tagBadgeItems = tags
        .map((tag) => ({
            id: tag.id,
            label:
                tag.name?.trim().length && tag.name.trim().length > 0
                    ? tag.name
                    : `tag-${tag.id}`,
            marcherIds: marcherIdsByTagIdMap?.get(tag.id) ?? [],
        }))
        .filter((tag) => tag.marcherIds.length > 0);

    return (
        <section>
            <div className="grid grid-cols-3 gap-8">
                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.section"
                            defaultValue="Section"
                        />
                    }
                    items={sections.map((sec) => ({
                        key: sec.name,
                        label: <T keyName={sec.tName} />,
                        marcherIds: getMarcherIdsBySectionName(
                            marchers as Marcher[],
                            sec.name,
                        ),
                        sourceType: "section" as const,
                    }))}
                />

                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.tag"
                            defaultValue="Tag"
                        />
                    }
                    disabled={tagBadgeItems.length === 0}
                    items={tagBadgeItems.map((tag) => ({
                        key: String(tag.id),
                        label: tag.label,
                        marcherIds: tag.marcherIds,
                        sourceType: "tag" as const,
                    }))}
                />

                <CollectionDropdownBadge
                    label={
                        <T
                            keyName="inspector.light.groups.addBy.family"
                            defaultValue="Family"
                        />
                    }
                    items={families.map((fam) => ({
                        key: fam.name,
                        label: <T keyName={fam.tName} />,
                        marcherIds: getMarcherIdsByFamily(
                            marchers as Marcher[],
                            fam,
                        ),
                        sourceType: "family" as const,
                    }))}
                />
                <MarcherCollectionDragBadge
                    sourceType="selection"
                    label={t("inspector.light.groups.addSelection", {
                        defaultValue: "Current selection",
                    })}
                    className="col-span-full w-full"
                    marcherIds={selectedIds}
                    variant={selectedIds.length > 0 ? "secondary" : "disabled"}
                    fullWidth
                >
                    {selectedIds.length > 0 ? (
                        <T
                            keyName="inspector.light.groups.currentSelectionCount"
                            defaultValue="Current Selection ({count})"
                            params={{ count: selectedIds.length }}
                        />
                    ) : (
                        <T
                            keyName="inspector.light.groups.noMarchersSelected"
                            defaultValue="No marchers selected"
                        />
                    )}
                </MarcherCollectionDragBadge>
            </div>
            <p className="text-text-subtitle mt-2 text-right text-xs">
                <T
                    keyName="inspector.light.groups.dragToAddToGroup"
                    defaultValue="Drag to add to a group"
                />
            </p>
        </section>
    );
}
