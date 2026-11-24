import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import {
    BufferAttribute,
    BufferGeometry,
    CircleGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
} from "three";
import type { FieldProperties } from "@openmarch/core";
import { parseCameraPose } from "@/view3d/sync/protocol";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { cameraWedge } from "./cameraWedge";

/** Over the field's lines and text, under props, paths and marchers. */
const ORDER = 1.2;
/** The app's accent purple. */
const ACCENT = 0x6442ff;
/** A pose this old means the 3D View stopped sending (closed, or its show changed). */
const STALE_MS = 3000;

/**
 * The 3D View's camera on the 2D field (fork #1207), when the View setting is
 * on and the 3D View is open: a dot where the camera stands and a wedge over
 * the ground it sees.
 */
export default function CameraMarkerLayer({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const shown = useUiSettingsStore(
        (s) => s.uiSettings.view3dCameraOnField === true,
    );
    const invalidate = useThree((s) => s.invalidate);
    const { group, wedge, dot, ring } = useMemo(() => {
        const material = (color: number, opacity = 1) =>
            new MeshBasicMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                depthTest: false,
                depthWrite: false,
                // The camera's y runs down the screen, so meshes face away from it
                side: DoubleSide,
            });
        const geometry = new BufferGeometry();
        geometry.setAttribute(
            "position",
            new BufferAttribute(new Float32Array(9), 3),
        );
        const wedge = new Mesh(geometry, material(ACCENT, 0.12));
        const ring = new Mesh(new CircleGeometry(1, 24), material(0xffffff));
        const dot = new Mesh(new CircleGeometry(1, 24), material(ACCENT));
        const group = new Group();
        group.visible = false;
        [wedge, ring, dot].forEach((mesh, i) => {
            mesh.frustumCulled = false;
            mesh.renderOrder = ORDER + i * 0.01;
            group.add(mesh);
        });
        return { group, wedge, dot, ring };
    }, []);

    useEffect(() => {
        const electron = window.electron;
        const hide = () => {
            if (!group.visible) return;
            group.visible = false;
            invalidate();
        };
        if (!shown || !electron?.onView3dCamera) {
            hide();
            return;
        }
        let stale = 0;
        const step = fieldProperties.pixelsPerStep;
        const stopCamera = electron.onView3dCamera((payload) => {
            const pose = parseCameraPose(payload);
            const w = pose && cameraWedge(pose, fieldProperties);
            window.clearTimeout(stale);
            if (!w) return hide();
            const position = wedge.geometry.getAttribute(
                "position",
            ) as BufferAttribute;
            position.setXYZ(0, w.apex.x, w.apex.y, 0);
            position.setXYZ(1, w.left.x, w.left.y, 0);
            position.setXYZ(2, w.right.x, w.right.y, 0);
            position.needsUpdate = true;
            wedge.geometry.computeBoundingSphere();
            dot.position.set(w.apex.x, w.apex.y, 0);
            dot.scale.setScalar(step * 0.9);
            ring.position.set(w.apex.x, w.apex.y, 0);
            ring.scale.setScalar(step * 1.3);
            group.visible = true;
            invalidate();
            stale = window.setTimeout(hide, STALE_MS);
        });
        const stopState = electron.onView3dWindowState?.((open) => {
            if (!open) hide();
        });
        return () => {
            window.clearTimeout(stale);
            stopCamera();
            stopState?.();
            hide();
        };
    }, [shown, fieldProperties, group, wedge, dot, ring, invalidate]);

    useEffect(
        () => () => {
            for (const mesh of [wedge, dot, ring]) {
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
        },
        [wedge, dot, ring],
    );

    return <primitive object={group} />;
}
