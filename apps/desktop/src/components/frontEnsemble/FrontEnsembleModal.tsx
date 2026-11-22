import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PianoKeysIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import ItemPanelHeader from "@/components/items/ItemPanelHeader";
import { ItemEditor } from "@/components/items/ItemEditor";
import {
    ItemRow,
    ShowNamesSwitch,
    type ItemWithMarcher,
} from "@/components/items/ItemRows";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import { isPodiumFamily, pitVariant } from "@/view3d/core/pit/catalog";
import FrontEnsemblePicker from "./FrontEnsemblePicker";
import PitPresets, { PitPresetStart } from "./PitPresets";
import { runAction } from "@/shortcuts/registry";
import { formatList } from "@/utilities/formatList";
import { usePitVariantLabel } from "./usePitVariantLabel";

/**
 * The front ensemble lives in the Marchers panel (owner, 2026-11-15: a pit is set up about once
 * per show, so it doesn't earn a sidebar button of its own): its views take the Marchers panel's
 * id, so the Marchers button stays lit
 */
export const FRONT_ENSEMBLE_PANEL_ID = "marchers";

/** Whether an item is a podium from the catalog: listed apart from the pit equipment */
const isPodiumItem = (item: ItemWithMarcher) => {
    const variant = pitVariant(item.model);
    return variant !== null && isPodiumFamily(variant.family);
};

/** The front ensemble's items, split into the pit equipment and the podiums */
export function splitFrontEnsemble(
    items: readonly ItemWithMarcher[] | undefined,
): { equipment: ItemWithMarcher[]; podiums: ItemWithMarcher[] } {
    const placed = (items ?? []).filter((item) => item.kind === "equipment");
    return {
        equipment: placed.filter((item) => !isPodiumItem(item)),
        podiums: placed.filter(isPodiumItem),
    };
}

/**
 * The front ensemble's place in the Marchers panel: what the show has (or that it has no pit) and
 * a button that opens the front ensemble view in the panel (the `openFrontEnsemble` action).
 */
export function FrontEnsembleSummary() {
    const { t } = useTranslate();
    const { data: items } = useQuery(allItemsQueryOptions());
    const { equipment, podiums } = useMemo(
        () => splitFrontEnsemble(items),
        [items],
    );
    const hasPit = equipment.length + podiums.length > 0;
    return (
        <section
            className="border-stroke bg-fg-2 rounded-6 flex items-center gap-12 border p-8"
            aria-label={t("frontEnsemble.summary.title")}
            data-testid="front-ensemble-summary"
        >
            <PianoKeysIcon size={20} className="text-text/70 shrink-0" />
            <div className="flex min-w-0 grow flex-col">
                <span className="text-body font-medium">
                    <T keyName="frontEnsemble.summary.title" />
                </span>
                <span className="text-sub text-text-subtitle">
                    {hasPit
                        ? formatList([
                              ...(equipment.length > 0
                                  ? [
                                        t("frontEnsemble.summary.equipment", {
                                            count: equipment.length,
                                        }),
                                    ]
                                  : []),
                              ...(podiums.length > 0
                                  ? [
                                        t("frontEnsemble.summary.podiums", {
                                            count: podiums.length,
                                        }),
                                    ]
                                  : []),
                          ])
                        : t("frontEnsemble.summary.none")}
                </span>
            </div>
            <Button
                size="compact"
                variant={hasPit ? "secondary" : "primary"}
                onClick={() => runAction("openFrontEnsemble")}
            >
                {hasPit
                    ? t("frontEnsemble.summary.edit")
                    : t("frontEnsemble.summary.setUp")}
            </Button>
        </section>
    );
}

/**
 * The front ensemble view (instruments.md §6), opened from the Marchers panel: the equipment and
 * podiums in the show, each with its edit view, and in its header Add (the catalog, its own view,
 * as the Marchers panel's Add is) and, once there's a pit, the presets (an empty view shows them
 * in its body, `PitPresetStart`). They're stored as items like props, but aren't
 * props to designers: they don't move and aren't part of the staging. `onBack` returns to the
 * Marchers panel.
 */
export function FrontEnsembleContents({ onBack }: { onBack?: () => void }) {
    const { setContent } = useSidebarModalStore();
    const { data: items } = useQuery(allItemsQueryOptions());
    const { equipment, podiums } = useMemo(
        () => splitFrontEnsemble(items),
        [items],
    );
    const isEmpty = equipment.length + podiums.length === 0;
    const onEdit = (item: ItemWithMarcher) =>
        setContent(
            <FrontEnsembleEditContents itemId={item.id} onBack={onBack} />,
            FRONT_ENSEMBLE_PANEL_ID,
        );
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader
                title={<T keyName="frontEnsemble.title" />}
                onBack={onBack}
                actions={
                    // An empty view offers both ways to start in its body instead
                    !isEmpty && (
                        <>
                            <PitPresets />
                            <Button
                                size="compact"
                                onClick={() =>
                                    runAction("addFrontEnsembleEquipment")
                                }
                            >
                                <T keyName="frontEnsemble.add.button" />
                            </Button>
                        </>
                    )
                }
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <div>
                    {isEmpty ? (
                        <FrontEnsembleStart />
                    ) : (
                        <div className="flex flex-col gap-16">
                            <ShowNamesSwitch
                                items={[...equipment, ...podiums]}
                            />
                            <EquipmentGroup
                                titleKey="frontEnsemble.list.equipment"
                                items={equipment}
                                onEdit={onEdit}
                            />
                            <EquipmentGroup
                                titleKey="frontEnsemble.list.podiums"
                                items={podiums}
                                onEdit={onEdit}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * The empty front ensemble view's body: the two ways to start, one under the other. A preset lays
 * out a whole pit (`PitPresetStart`); "Build it yourself" opens the Add view to place equipment
 * one piece at a time.
 */
function FrontEnsembleStart() {
    const { t } = useTranslate();
    return (
        <div className="flex flex-col gap-24">
            <PitPresetStart />
            <section
                className="flex flex-col gap-12"
                aria-label={t("frontEnsemble.custom.title")}
            >
                <h4 className="text-body font-medium">
                    <T keyName="frontEnsemble.custom.title" />
                </h4>
                <div className="border-stroke bg-fg-2 rounded-6 flex items-center gap-12 border p-8">
                    <p className="text-sub text-text-subtitle grow">
                        <T keyName="frontEnsemble.custom.description" />
                    </p>
                    <Button
                        size="compact"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => runAction("addFrontEnsembleEquipment")}
                    >
                        <T keyName="frontEnsemble.custom.button" />
                    </Button>
                </div>
            </section>
        </div>
    );
}

/**
 * The front ensemble's Add view: every model as a picture, by group, with search
 * (`FrontEnsemblePicker`); picking one closes the panel to place it on the field. Back returns to
 * the list, whose own back button goes to `onBack`.
 */
export function FrontEnsembleAddContents({ onBack }: { onBack?: () => void }) {
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader
                title={<T keyName="frontEnsemble.add.title" />}
                onBack={() =>
                    setContent(
                        <FrontEnsembleContents onBack={onBack} />,
                        FRONT_ENSEMBLE_PANEL_ID,
                    )
                }
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <FrontEnsemblePicker />
            </div>
        </div>
    );
}

/** One group of the panel's list, under its heading; nothing when it's empty */
function EquipmentGroup({
    titleKey,
    items,
    onEdit,
}: {
    titleKey: "frontEnsemble.list.equipment" | "frontEnsemble.list.podiums";
    items: readonly ItemWithMarcher[];
    onEdit: (item: ItemWithMarcher) => void;
}) {
    const { t } = useTranslate();
    const variantLabel = usePitVariantLabel();
    if (items.length === 0) return null;
    const podium = titleKey === "frontEnsemble.list.podiums";
    const subtitle = (item: ItemWithMarcher) => {
        const variant = pitVariant(item.model);
        if (!variant) return t("frontEnsemble.equipment.block");
        const family = t(`pit.family.${variant.family}`);
        return variant.label.length > 0
            ? `${family} · ${variantLabel(variant)}`
            : family;
    };
    return (
        <section className="flex flex-col gap-8" aria-label={t(titleKey)}>
            <h5 className="text-sub text-text-subtitle px-4 font-medium tracking-wide uppercase">
                {t(titleKey)}
            </h5>
            {items.map((item) => (
                <ItemRow
                    key={item.id}
                    item={item}
                    subtitle={subtitle(item)}
                    editLabel={t(
                        podium
                            ? "frontEnsemble.podium.edit"
                            : "frontEnsemble.equipment.edit",
                    )}
                    deleteLabel={t(
                        podium
                            ? "frontEnsemble.podium.delete"
                            : "frontEnsemble.equipment.delete",
                    )}
                    onEdit={onEdit}
                />
            ))}
        </section>
    );
}

/** A piece of equipment's or a podium's edit view: its name, model, lock and Outline */
export function FrontEnsembleEditContents({
    itemId,
    onBack,
}: {
    itemId: number;
    /** Where the front ensemble view's own back button goes */
    onBack?: () => void;
}) {
    const { setContent } = useSidebarModalStore();
    const { data: items } = useQuery(allItemsQueryOptions());
    const item = items?.find((i) => i.id === itemId);
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader
                title={
                    item && isPodiumItem(item) ? (
                        <T keyName="frontEnsemble.podium.editTitle" />
                    ) : (
                        <T keyName="frontEnsemble.equipment.editTitle" />
                    )
                }
                onBack={() =>
                    setContent(
                        <FrontEnsembleContents onBack={onBack} />,
                        FRONT_ENSEMBLE_PANEL_ID,
                    )
                }
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <ItemEditor itemId={itemId} />
            </div>
        </div>
    );
}
