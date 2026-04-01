import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";
import type { SurfaceType, ShapeType } from "@/global/classes/Prop";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";

const PASTE_OFFSET = 30;

const clipboardEntryShape = {
    name: "",
    surface_type: "",
    shape_type: "",
    custom_geometry: null as string | null,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
};
export type PropClipboardEntry = typeof clipboardEntryShape;

export function usePropClipboard({
    canvas,
    canvasRef,
    selectedPageId,
    focussedComponent,
    createPropsMutate,
}: {
    canvas: OpenMarchCanvas | null;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    selectedPageId: number | undefined;
    focussedComponent: string;
    createPropsMutate: (
        props: {
            name: string;
            surface_type: SurfaceType;
            width: number;
            height: number;
            shape_type: ShapeType;
            custom_geometry?: string;
            initial_x: number;
            initial_y: number;
        }[],
    ) => void;
}) {
    const clipboardRef = useRef<PropClipboardEntry[]>([]);
    const { data: props } = useQuery(allPropsQueryOptions());
    const { data: propGeometries } = useQuery(propPageGeometryQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPageId),
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                !canvas ||
                !props ||
                !propGeometries ||
                !marcherPages ||
                focussedComponent !== "canvas" ||
                document.activeElement?.matches(
                    "input, textarea, select, [contenteditable]",
                )
            )
                return;

            const isCtrl = e.ctrlKey || e.metaKey;

            if (isCtrl && e.key === "c") {
                const activeProps = canvas
                    .getCanvasMarchers({ active: true })
                    .filter(CanvasProp.isCanvasProp);
                if (activeProps.length === 0) return;

                clipboardRef.current = activeProps
                    .map((cp) => {
                        const mp = marcherPages[cp.marcherObj.id];
                        const prop = props.find(
                            (p) => p.marcher_id === cp.marcherObj.id,
                        );
                        const geom = propGeometries.find(
                            (g) => g.marcher_page_id === mp?.id,
                        );
                        if (!mp || !prop || !geom) return null;
                        return {
                            name:
                                prop.marcher.name ?? prop.marcher.drill_prefix,
                            surface_type: prop.surface_type,
                            shape_type: geom.shape_type,
                            custom_geometry: geom.custom_geometry,
                            width: geom.width,
                            height: geom.height,
                            x: mp.x,
                            y: mp.y,
                        };
                    })
                    .filter(Boolean) as PropClipboardEntry[];
            }

            if (isCtrl && e.key === "v" && clipboardRef.current.length > 0) {
                if (focussedComponent !== "canvas") return;
                if (
                    document.activeElement?.matches(
                        "input, textarea, select, [contenteditable]",
                    )
                )
                    return;

                e.preventDefault();
                createPropsMutate(
                    clipboardRef.current.map((data) => ({
                        name: data.name,
                        surface_type: data.surface_type as SurfaceType,
                        width: data.width,
                        height: data.height,
                        shape_type: data.shape_type as ShapeType,
                        custom_geometry: data.custom_geometry ?? undefined,
                        initial_x: data.x + PASTE_OFFSET,
                        initial_y: data.y + PASTE_OFFSET,
                    })),
                );
            }
        };

        const handleBlur = () => {
            clipboardRef.current = [];
        };
        const canvasEl = canvasRef.current;

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("blur", handleBlur);
        canvasEl?.addEventListener("focusout", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("blur", handleBlur);
            canvasEl?.removeEventListener("focusout", handleBlur);
        };
    }, [
        canvas,
        props,
        propGeometries,
        marcherPages,
        focussedComponent,
        createPropsMutate,
    ]);
}
