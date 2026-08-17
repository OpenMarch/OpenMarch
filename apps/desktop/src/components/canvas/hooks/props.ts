import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";
import {
    getPixelsPerFoot,
    type PropWithMarcher,
    type DatabasePropPageGeometry,
} from "@/global/classes/Prop";
import {
    addPropsToCanvas,
    removePropsFromCanvas,
    propDisplayName,
} from "@/global/classes/canvasObjects/renderProps";
import type MarcherPage from "@/global/classes/MarcherPage";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import type { FieldProperties } from "@openmarch/core";

/**
 * Fingerprint of everything that forces a full prop rebuild. When it is
 * unchanged between renders, existing CanvasProps are only repositioned and
 * relabeled (the cheap path) instead of being destroyed and recreated.
 */
function buildPropStructureKey({
    props,
    propGeometries,
    marcherPages,
    imageCacheVersion,
    pageId,
    showPropNames,
    propNameOverrides,
    hiddenPropIds,
    propRecreateKey,
}: {
    props: PropWithMarcher[];
    propGeometries: DatabasePropPageGeometry[];
    marcherPages: Record<number, MarcherPage>;
    imageCacheVersion: number;
    pageId: number;
    showPropNames: boolean;
    propNameOverrides: Record<string, boolean>;
    hiddenPropIds: Record<string, boolean>;
    propRecreateKey: number;
}): string {
    // Only this page's geometry can change what is on the canvas. Fingerprinting
    // every row in the show made an edit on any other page tear down and rebuild
    // every prop here, and made the string O(props × pages) on every render.
    const currentPageMpIds = new Set(
        props
            .map((p) => marcherPages[p.marcher_id]?.id)
            .filter((id): id is number => id != null),
    );

    return JSON.stringify({
        propIds: props.map((p) => p.id),
        propMpIds: props.map((p) => marcherPages[p.marcher_id]?.id ?? null),
        geoKeys: propGeometries
            .filter((g) => currentPageMpIds.has(g.marcher_page_id))
            .map(
                (g) =>
                    `${g.id}:${g.width}:${g.height}:${g.outline_type}:${g.rotation}`,
            ),
        opacities: props.map((p) => p.image_opacity),
        imgVer: imageCacheVersion,
        pageId,
        showNames: showPropNames,
        nameOverrides: propNameOverrides,
        hiddenIds: hiddenPropIds,
        propRecreateKey,
    });
}

export function useRenderProps({
    canvas,
    selectedPage,
    fieldProperties,
    propImageCacheRef,
    imageCacheVersion,
    propRecreateKey,
    showPropNames,
    propNameOverrides,
    hiddenPropIds,
}: {
    canvas: OpenMarchCanvas | null;
    selectedPage: { id: number } | null;
    fieldProperties: FieldProperties | undefined;
    propImageCacheRef: React.MutableRefObject<
        Map<number, { el: HTMLImageElement; url: string }>
    >;
    imageCacheVersion: number;
    propRecreateKey: number;
    showPropNames: boolean;
    propNameOverrides: Record<string, boolean>;
    hiddenPropIds: Record<string, boolean>;
}) {
    const { data: props } = useQuery(allPropsQueryOptions());
    const { data: propGeometries } = useQuery(propPageGeometryQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );

    const prevPropStructureRef = useRef<string>("");

    useEffect(() => {
        if (
            !canvas ||
            !props ||
            !propGeometries ||
            !marcherPages ||
            !fieldProperties ||
            !selectedPage
        )
            return;

        const structureKey = buildPropStructureKey({
            props,
            propGeometries,
            marcherPages,
            imageCacheVersion,
            pageId: selectedPage.id,
            showPropNames,
            propNameOverrides,
            hiddenPropIds,
            propRecreateKey,
        });

        // Fast path: structure unchanged, so just reposition/relabel in place.
        if (structureKey === prevPropStructureRef.current) {
            const propById = new Map(props.map((p) => [p.id, p]));
            canvas
                .getObjects()
                .filter(CanvasProp.isCanvasProp)
                .forEach((cp) => {
                    const mp = marcherPages[cp.marcherObj.id];
                    if (mp) {
                        cp.setMarcherCoords(mp);
                        cp.resetLiveGeometry();
                    }
                    const prop = propById.get(cp.propId);
                    if (prop) {
                        const showName =
                            propNameOverrides[prop.id.toString()] ??
                            showPropNames;
                        cp.updateNameLabel(propDisplayName(prop), showName);
                    }
                });
            canvas.requestRenderAll();
            return;
        }
        prevPropStructureRef.current = structureKey;

        removePropsFromCanvas(
            canvas,
            canvas.getObjects().filter(CanvasProp.isCanvasProp),
        );

        addPropsToCanvas({
            canvas,
            props,
            geometries: propGeometries,
            marcherPages,
            pixelsPerFoot: getPixelsPerFoot(),
            pageId: selectedPage.id,
            display: {
                hiddenPropIds,
                showNameFor: (prop) =>
                    propNameOverrides[prop.id.toString()] ?? showPropNames,
                imageFor: (prop) => propImageCacheRef.current.get(prop.id)?.el,
            },
        });

        canvas.requestRenderAll();
    }, [
        canvas,
        props,
        propGeometries,
        marcherPages,
        fieldProperties,
        selectedPage,
        imageCacheVersion,
        propRecreateKey,
        showPropNames,
        propNameOverrides,
        hiddenPropIds,
    ]);
}
