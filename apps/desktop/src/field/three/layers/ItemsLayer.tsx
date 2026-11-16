import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    ShapeUtils,
    Vector2,
} from "three";
import type { FieldTheme } from "@openmarch/core";
import { useFieldDraw } from "../fieldDrawContext";
import type { FieldDimming } from "../fieldDimming";
import type { FieldItems } from "../fieldItems";
import type { FieldMarchers } from "../fieldMarchers";
import { planItems, type FillPlan } from "../itemsPlan";
import { StrokeBatch } from "../overlayBatches";

/**
 * Props and equipment on the field (C2.1): each item's Outline at the beat
 * drawn, filled and outlined, in two draws whatever the count. Under the
 * pathways and marchers, since props sit on the field. The plan is rebuilt in
 * a frame hook when the marchers, the items, the selection or the dimming
 * change, never through React state; during playback that's each frame, for
 * the few items a show has.
 */
export default function ItemsLayer({
    marchers,
    items,
    dimming,
    theme,
    renderOrder,
}: {
    marchers: FieldMarchers;
    items: FieldItems;
    dimming: FieldDimming;
    theme: FieldTheme;
    renderOrder: number;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const layer = useMemo(() => {
        const strokes = new StrokeBatch();
        const fills = new Mesh(
            new BufferGeometry(),
            new MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                side: DoubleSide,
            }),
        );
        fills.frustumCulled = false;
        fills.renderOrder = renderOrder;
        strokes.mesh.renderOrder = renderOrder + 0.01;
        const group = new Group();
        group.add(fills, strokes.mesh);
        return { strokes, fills, group };
    }, [renderOrder]);
    const drawn = useRef({
        version: -1,
        itemsVersion: -1,
        selectionVersion: -1,
        dimVersion: -1,
        zoom: -1,
        theme: null as FieldTheme | null,
    });

    useEffect(
        () => () => {
            layer.strokes.dispose();
            layer.fills.geometry.dispose();
            layer.fills.material.dispose();
        },
        [layer],
    );
    // A change to the items (a refetch, a preview) draws the next frame
    useEffect(() => items.subscribe(invalidate), [items, invalidate]);
    useEffect(() => {
        drawn.current.theme = null;
        invalidate();
    }, [theme, invalidate]);

    useFrame(({ gl }) => {
        const { zoom } = draw.view.getState();
        layer.strokes.setScale(1 / zoom, 1 / (zoom * gl.getPixelRatio()));
        const last = drawn.current;
        if (
            last.version === marchers.version &&
            last.itemsVersion === items.version &&
            last.selectionVersion === marchers.selectionVersion &&
            last.dimVersion === dimming.version &&
            // Locks are the same size on screen at every zoom
            (last.zoom === zoom || !hasLocks(items)) &&
            last.theme === theme
        )
            return;
        const selected = new Set<number>();
        marchers.ids.forEach((id, i) => {
            if (marchers.selected[i]) selected.add(id);
        });
        const plan = planItems(items.outlines(), {
            theme,
            selected,
            isDimmed: (id) => dimming.isDimmed(id),
            zoom,
        });
        layer.strokes.set(plan.strokes);
        writeFills(layer.fills.geometry, plan.fills);
        drawn.current = {
            version: marchers.version,
            itemsVersion: items.version,
            selectionVersion: marchers.selectionVersion,
            dimVersion: dimming.version,
            zoom,
            theme,
        };
    });

    return <primitive object={layer.group} />;
}

const hasLocks = (items: FieldItems) =>
    items.outlines().some((outline) => outline.locked);

/** Triangulates each fill into `geometry`, with its color on every vertex. */
function writeFills(geometry: BufferGeometry, fills: readonly FillPlan[]) {
    const positions: number[] = [];
    const colors: number[] = [];
    for (const { points, color } of fills) {
        if (points.length < 3) continue;
        const contour = points.map((p) => new Vector2(p.x, p.y));
        for (const triangle of ShapeUtils.triangulateShape(contour, []))
            for (const index of triangle) {
                const p = points[index];
                positions.push(p.x, p.y, 0);
                colors.push(...color);
            }
    }
    geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(positions), 3),
    );
    geometry.setAttribute(
        "color",
        new BufferAttribute(new Float32Array(colors), 4),
    );
    geometry.computeBoundingSphere();
}
