import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";
import { getPixelsPerFoot } from "@/global/classes/Prop";
import {
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import type { FieldProperties } from "@openmarch/core";

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

        const structureKey = JSON.stringify({
            propIds: props.map((p) => p.id),
            propMpIds: props.map((p) => marcherPages[p.marcher_id]?.id ?? null),
            geoKeys: propGeometries.map(
                (g) =>
                    `${g.id}:${g.width}:${g.height}:${g.shape_type}:${g.rotation}:${g.visible}`,
            ),
            opacities: props.map((p) => p.image_opacity),
            imgVer: imageCacheVersion,
            pageId: selectedPage.id,
            showNames: showPropNames,
            nameOverrides: propNameOverrides,
            hiddenIds: hiddenPropIds,
            propRecreateKey,
        });

        if (structureKey === prevPropStructureRef.current) {
            const propById = new Map(props.map((p) => [p.id, p]));
            canvas
                .getObjects()
                .filter(CanvasProp.isCanvasProp)
                .forEach((cp) => {
                    const mp = marcherPages[cp.marcherObj.id];
                    if (mp) cp.setMarcherCoords(mp);
                    const prop = propById.get(cp.propId);
                    if (prop) {
                        const name =
                            prop.marcher.name ||
                            `${prop.marcher.drill_prefix}${prop.marcher.drill_order}`;
                        const showName =
                            propNameOverrides[prop.id.toString()] ??
                            showPropNames;
                        cp.updateNameLabel(name, showName);
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

        const geometryByMpId = new Map(
            propGeometries.map((g) => [g.marcher_page_id, g]),
        );
        const marcherPagesForPage = Object.values(marcherPages);
        const pixelsPerFoot = getPixelsPerFoot(fieldProperties);

        for (const prop of props) {
            const marcherPage = marcherPagesForPage.find(
                (mp) => mp.marcher_id === prop.marcher_id,
            );
            if (!marcherPage) continue;

            const geometry = geometryByMpId.get(marcherPage.id);
            if (!geometry || !geometry.visible) continue;
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
