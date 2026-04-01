import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";

const SURFACE_KEYS: Record<string, string> = {
    floor: "inspector.prop.surfaceType.floor",
    platform: "inspector.prop.surfaceType.platform",
    obstacle: "inspector.prop.surfaceType.obstacle",
};

const SHAPE_KEYS: Record<string, string> = {
    rectangle: "inspector.prop.shapeType.rectangle",
    circle: "inspector.prop.shapeType.circle",
    custom: "inspector.prop.shapeType.custom",
};

const fmtFeet = (val: number | null | undefined, notSet: string) =>
    val == null ? notSet : `${val.toFixed(1)} ft`;

/**
 * Inspector section shown when a single prop-type marcher is selected.
 * Displays prop metadata and per-page geometry dimensions in feet.
 */
export default function PropEditor() {
    const { t } = useTranslate();
    const { selectedMarchers } = useSelectedMarchers()!;
    const { selectedPage } = useSelectedPage()!;

    const { data: props } = useQuery(allPropsQueryOptions());
    const { data: allGeometries } = useQuery(propPageGeometryQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );

    const selectedProp = useMemo(() => {
        if (selectedMarchers.length !== 1) return null;
        const marcher = selectedMarchers[0];
        if (marcher.type !== "prop" || !props) return null;
        return props.find((p) => p.marcher_id === marcher.id) ?? null;
    }, [selectedMarchers, props]);

    const geometry = useMemo(() => {
        if (!selectedProp || !allGeometries || !marcherPages) return null;
        const mp = Object.values(marcherPages).find(
            (m) => m.marcher_id === selectedProp.marcher_id,
        );
        if (!mp) return null;
        return allGeometries.find((g) => g.marcher_page_id === mp.id) ?? null;
    }, [selectedProp, allGeometries, marcherPages]);

    if (!selectedProp) return null;

    const Row = ({
        label,
        value,
    }: {
        label: string;
        value: React.ReactNode;
    }) => (
        <div className="flex items-center justify-between px-6">
            <span className="text-body leading-none opacity-80">{label}</span>
            <span className="text-body leading-none">{value}</span>
        </div>
    );

    const notSet = t("inspector.prop.notSet");

    return (
        <InspectorCollapsible
            defaultOpen
            translatableTitle={{ keyName: "inspector.prop.title" }}
            className="mt-12 flex flex-col gap-16"
        >
            <Row
                label={t("inspector.prop.name")}
                value={
                    selectedProp.marcher.name ||
                    selectedProp.marcher.drill_prefix +
                        selectedProp.marcher.drill_order
                }
            />
            <Row
                label={t("inspector.prop.surface")}
                value={
                    SURFACE_KEYS[selectedProp.surface_type]
                        ? t(SURFACE_KEYS[selectedProp.surface_type])
                        : selectedProp.surface_type
                }
            />

            {geometry && (
                <>
                    <hr className="border-stroke w-full border" />

                    <h3 className="text-h3 px-6">
                        <T keyName="inspector.prop.geometry" />
                    </h3>
                    {selectedPage && (
                        <h4 className="text-text-subtitle px-6">
                            <T
                                keyName="inspector.prop.pageSubtitle"
                                params={{ pageName: selectedPage.name }}
                            />
                        </h4>
                    )}

                    <Row
                        label={t("inspector.prop.shape")}
                        value={
                            SHAPE_KEYS[geometry.shape_type]
                                ? t(SHAPE_KEYS[geometry.shape_type])
                                : geometry.shape_type
                        }
                    />
                    <Row
                        label={t("inspector.prop.width")}
                        value={fmtFeet(geometry.width, notSet)}
                    />
                    <Row
                        label={t("inspector.prop.height")}
                        value={fmtFeet(geometry.height, notSet)}
                    />
                    {geometry.radius != null && (
                        <Row
                            label={t("inspector.prop.radius")}
                            value={fmtFeet(geometry.radius, notSet)}
                        />
                    )}
                    <Row
                        label={t("inspector.prop.rotation")}
                        value={`${geometry.rotation}°`}
                    />
                    <Row
                        label={t("inspector.prop.visible")}
                        value={
                            geometry.visible
                                ? t("inspector.prop.yes")
                                : t("inspector.prop.no")
                        }
                    />
                </>
            )}
        </InspectorCollapsible>
    );
}
