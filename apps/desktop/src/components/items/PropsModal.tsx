import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    BezierCurveIcon,
    CircleIcon,
    CubeIcon,
    PencilSimpleIcon,
    PolygonIcon,
    SquareIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import type { OutlineType } from "@/db-functions/items";
import ItemPanelHeader from "./ItemPanelHeader";
import { ItemEditor, PropColorControl } from "./ItemEditor";
import { ItemRow, ShowNamesSwitch, type ItemWithMarcher } from "./ItemRows";

const OUTLINE_TOOLS: { id: OutlineType; icon: React.ReactNode }[] = [
    { id: "rectangle", icon: <SquareIcon size={24} /> },
    { id: "circle", icon: <CircleIcon size={24} /> },
    { id: "arc", icon: <BezierCurveIcon size={24} /> },
    { id: "polygon", icon: <PolygonIcon size={24} /> },
    { id: "freehand", icon: <PencilSimpleIcon size={24} /> },
];

/** The props among the show's items: front ensemble equipment has its own panel */
export const propsOnly = (
    items: readonly ItemWithMarcher[] | undefined,
): ItemWithMarcher[] => (items ?? []).filter((item) => item.kind === "prop");

/**
 * Props in the show (C2.1, rebuilt from PR 1013): draw a new prop at the playhead, hide props or
 * show their names on the field, and edit one's name, surface, color, lock and Outline at the
 * playhead. Front ensemble equipment and podiums are in the Front ensemble panel instead: they
 * don't move and aren't staging.
 */
export default function PropsModal() {
    const { t } = useTranslate();
    return (
        <SidebarModalLauncher
            name={t("sidebar.props")}
            contents={<PropListContents />}
            newContentId="props"
            buttonLabel={<CubeIcon size={24} />}
        />
    );
}

export function PropListContents() {
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader title={<T keyName="props.title" />} />
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
    const { data: items } = useQuery(allItemsQueryOptions());
    const { selectedMarchers } = useSelectedMarchers()!;
    const propItems = useMemo(() => propsOnly(items), [items]);
    const selectedProps = useMemo(() => {
        const ids = new Set(selectedMarchers.map((m) => m.id));
        return propItems.filter((item) => ids.has(item.marcher_id));
    }, [propItems, selectedMarchers]);

    if (propItems.length === 0)
        return (
            <p className="text-text/50 py-16 text-center">
                <T keyName="props.empty" />
            </p>
        );

    return (
        <div className="flex flex-col gap-8">
            <ShowNamesSwitch items={propItems} />
            {selectedProps.length > 1 && (
                <div className="flex items-center justify-between px-4 pb-4 text-sm">
                    <span className="text-text/70">
                        <T
                            keyName="props.selectedCount"
                            params={{ count: selectedProps.length }}
                        />
                    </span>
                    <PropColorControl items={selectedProps} />
                </div>
            )}
            {propItems.map((item) => (
                <ItemRow
                    key={item.id}
                    item={item}
                    subtitle={
                        item.surface_type
                            ? t(`props.surface.${item.surface_type}`)
                            : null
                    }
                    editLabel={t("props.edit")}
                    deleteLabel={t("props.delete")}
                    onEdit={onEdit}
                />
            ))}
        </div>
    );
}

export function PropEditContents({ itemId }: { itemId: number }) {
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader
                title={<T keyName="props.editTitle" />}
                onBack={() => setContent(<PropListContents />, "props")}
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <ItemEditor itemId={itemId} />
            </div>
        </div>
    );
}
