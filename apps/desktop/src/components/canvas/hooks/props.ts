import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";
import {
    getPixelsPerFoot,
    type PropWithMarcher,
    type DatabasePropPageGeometry,
} from "@/global/classes/Prop";
import { resolvePropsForPage } from "@/global/classes/propSelectors";
import type MarcherPage from "@/global/classes/MarcherPage";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import type { FieldProperties } from "@openmarch/core";

/** A prop's on-canvas label: its name, or drill number as a fallback. */
const propDisplayName = (prop: PropWithMarcher): string =>
    prop.marcher.name ||
    `${prop.marcher.drill_prefix}${prop.marcher.drill_order}`;

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
    return JSON.stringify({
        propIds: props.map((p) => p.id),
        propMpIds: props.map((p) => marcherPages[p.marcher_id]?.id ?? null),
        geoKeys: propGeometries.map(
            (g) =>
                `${g.id}:${g.width}:${g.height}:${g.shape_type}:${g.rotation}:${g.visible}`,
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

        canvas
            .getObjects()
            .filter(CanvasProp.isCanvasProp)
            .forEach((prop) => {
                canvas.remove(prop.propNameLabel);
                canvas.remove(prop);
            });

        const pixelsPerFoot = getPixelsPerFoot();
        const resolvedProps = resolvePropsForPage({
            props,
            geometries: propGeometries,
            marcherPages,
        });

        for (const { prop, marcherPage, geometry } of resolvedProps) {
            if (!geometry.visible) continue;
            if (hiddenPropIds[prop.id.toString()]) continue;

            const canvasProp = new CanvasProp({
                marcher: prop.marcher,
                prop,
                geometry,
                coordinate: { x: marcherPage.x, y: marcherPage.y },
                pixelsPerFoot,
                pageId: selectedPage.id,
                showName:
                    propNameOverrides[prop.id.toString()] ?? showPropNames,
                imageElement: propImageCacheRef.current.get(prop.id)?.el,
                imageOpacity: prop.image_opacity,
            });
            canvas.add(canvasProp);
            canvas.add(canvasProp.propNameLabel);
        }

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
