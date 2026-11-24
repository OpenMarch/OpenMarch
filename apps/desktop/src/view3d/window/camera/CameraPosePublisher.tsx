import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import type { View3dCameraPose } from "@/view3d/sync/protocol";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { requestDraw } from "../drawWake";

/** Fastest the pose goes out while the camera moves, and how often while it stands still. */
const MOVING_MS = 100;
const STILL_MS = 1000;

/**
 * Tells the editor where the camera is (`view3d:camera`, ADR 0010 D-4), so
 * the 2D field can show it (fork #1207): on drawn frames while it moves, and
 * once a second from a timer, since the window draws only when something
 * changes. Only while the editor shows the camera (`view3d:camera-wanted`).
 */
export default function CameraPosePublisher() {
    const camera = useThree((s) => s.camera);
    const direction = useMemo(() => new Vector3(), []);
    /** The pose last sent, and when */
    const last = useRef<{ key: string; at: number; pose: View3dCameraPose }>(
        null,
    );
    /** A newer pose held back by the throttle, sent when it ends */
    const pending = useRef<{ key: string; pose: View3dCameraPose }>(null);
    const trailing = useRef(0);
    const wanted = useView3dSyncStore((s) => s.cameraWanted);
    const send = wanted ? window.view3d?.sendCamera : undefined;

    useEffect(() => {
        if (!send) return;
        // Turned on: the next frame sends where the camera is now
        last.current = null;
        pending.current = null;
        requestDraw(50);
        const timer = window.setInterval(() => {
            if (last.current) send(last.current.pose);
        }, STILL_MS);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(trailing.current);
        };
    }, [send]);

    useFrame(() => {
        if (!send) return;
        camera.getWorldDirection(direction);
        const perspective = camera as PerspectiveCamera;
        const pose: View3dCameraPose = {
            position: [camera.position.x, camera.position.y, camera.position.z],
            direction: [direction.x, direction.y, direction.z],
            fov: perspective.fov ?? 50,
            aspect: perspective.aspect ?? 1.6,
        };
        const key = [...pose.position, ...pose.direction, pose.fov, pose.aspect]
            .map((n) => n.toFixed(2))
            .join(",");
        if (key === (pending.current ?? last.current)?.key) return;
        const publish = (next: { key: string; pose: View3dCameraPose }) => {
            pending.current = null;
            last.current = { ...next, at: performance.now() };
            send(next.pose);
        };
        const wait = last.current
            ? MOVING_MS - (performance.now() - last.current.at)
            : 0;
        if (wait <= 0) return publish({ key, pose });
        // The window draws only when something changes, so the frame where the camera
        // settles may be the last: send it when the throttle ends
        const first = !pending.current;
        pending.current = { key, pose };
        if (first)
            trailing.current = window.setTimeout(() => {
                if (pending.current) publish(pending.current);
            }, wait);
    });
    return null;
}
