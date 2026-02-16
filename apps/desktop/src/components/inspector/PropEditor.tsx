import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";

const SURFACE_LABELS: Record<string, string> = {
    floor: "Floor",
    platform: "Platform",
    obstacle: "Obstacle",
};

const SHAPE_LABELS: Record<string, string> = {
    rectangle: "Rectangle",
    circle: "Circle",
    custom: "Custom",
};

const fmtFeet = (val: number | null | undefined) =>
    val == null ? "—" : `${val.toFixed(1)} ft`;

/**
 * Inspector section shown when a single prop-type marcher is selected.
 * Displays prop metadata and per-page geometry dimensions in feet.
 */
export default function PropEditor() {
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

    return (
        <InspectorCollapsible
            defaultOpen
            title="Prop"
            className="mt-12 flex flex-col gap-16"
        >
            <Row
                label="Name"
                value={
                    selectedProp.marcher.name ||
                    selectedProp.marcher.drill_prefix +
                        selectedProp.marcher.drill_order
                }
            />
            <Row
                label="Surface"
                value={
                    SURFACE_LABELS[selectedProp.surface_type] ??
                    selectedProp.surface_type
                }
            />

            {geometry && (
                <>
                    <hr className="border-stroke w-full border" />

                    <h5 className="text-h5 px-6">
                        Geometry{selectedPage ? ` — ${selectedPage.name}` : ""}
                    </h5>

                    <Row
                        label="Shape"
                        value={
                            SHAPE_LABELS[geometry.shape_type] ??
                            geometry.shape_type
                        }
                    />
                    <Row label="Width" value={fmtFeet(geometry.width)} />
                    <Row label="Height" value={fmtFeet(geometry.height)} />
                    {geometry.radius != null && (
                        <Row label="Radius" value={fmtFeet(geometry.radius)} />
                    )}
                    <Row label="Rotation" value={`${geometry.rotation}°`} />
                    <Row
                        label="Visible"
                        value={geometry.visible ? "Yes" : "No"}
                    />
                </>
            )}
        </InspectorCollapsible>
    );
}
