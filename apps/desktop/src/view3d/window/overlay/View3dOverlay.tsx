/**
 * The 3D View window's overlay (ui.md UI-2, UI-5, UI-6), floating over the
 * scene:
 *
 * - top left: the venue picker;
 * - top right: lighting, crowd and fullscreen;
 * - bottom: the readout, then the camera bar.
 *
 * In fullscreen, everything but the readout hides after 3 s without pointer
 * movement, and the readout grows. F toggles fullscreen and C the crowd; the
 * camera rig (P3.2) owns 1–9 and Esc for pick-a-seat.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { CornersInIcon, CornersOutIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useCameraStore } from "../camera/cameraStore";
import { CameraBar } from "./CameraBar";
import { Panel, PanelSeparator, ToggleButton } from "./Panel";
import { Readout } from "./Readout";
import { useFullscreen, usePointerIdle } from "./useFullscreen";
import {
    CrowdToggle,
    LightingControl,
    VenuePicker,
    useVenueRequest,
} from "./VenueControls";

/** Below this overlay width, the venue picker becomes a Select. */
export const COMPACT_VENUE_WIDTH = 1040;

/** The overlay's width, tracked with a ResizeObserver. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(() => window.innerWidth);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width),
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}

/** True when a key press is meant for a text field or another control. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
}

/**
 * F toggles fullscreen and C the crowd. Esc leaves fullscreen unless the rig
 * used it to cancel pick-a-seat.
 */
function useOverlayShortcuts(toggleFullscreen: () => void) {
    const { settings, request } = useVenueRequest();
    const latest = useRef({ settings, request, toggleFullscreen });
    latest.current = { settings, request, toggleFullscreen };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.repeat ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                isTypingTarget(event.target)
            )
                return;
            const key = event.key.toLowerCase();
            const { settings, request, toggleFullscreen } = latest.current;
            if (key === "f") {
                event.preventDefault();
                toggleFullscreen();
            } else if (key === "c" && settings) {
                event.preventDefault();
                request({ kind: "crowd", crowd: !settings.crowd });
            } else if (
                key === "escape" &&
                document.fullscreenElement &&
                !event.defaultPrevented &&
                // The rig cancels pick-a-seat on this Esc instead.
                !useCameraStore.getState().pickMode
            ) {
                void document.exitFullscreen();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}

export default function View3dOverlay() {
    const { t } = useTranslate();
    const rootRef = useRef<HTMLDivElement>(null);
    const width = useWidth(rootRef);
    const { isFullscreen, toggleFullscreen } = useFullscreen();
    const hidden = usePointerIdle(isFullscreen);
    useOverlayShortcuts(toggleFullscreen);

    const fade = clsx(
        "motion-safe:transition-opacity motion-safe:duration-300",
        hidden && "opacity-0 [&_*]:pointer-events-none!",
    );
    const fullscreenLabel = t(
        isFullscreen
            ? "view3d.overlay.exitFullscreen"
            : "view3d.overlay.enterFullscreen",
    );

    return (
        <div
            ref={rootRef}
            className={clsx(
                "pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-8 p-8",
                hidden && "cursor-none",
            )}
            data-testid="view3d-overlay"
            data-hidden={hidden}
            data-fullscreen={isFullscreen}
        >
            <div
                className={clsx(
                    "flex flex-wrap items-start justify-between gap-8",
                    fade,
                )}
            >
                <Panel label={t("view3d.overlay.venue")}>
                    <VenuePicker compact={width < COMPACT_VENUE_WIDTH} />
                </Panel>
                <Panel>
                    <LightingControl />
                    <PanelSeparator />
                    <CrowdToggle />
                    <ToggleButton
                        pressed={isFullscreen}
                        onClick={toggleFullscreen}
                        icon={
                            isFullscreen ? (
                                <CornersInIcon size={16} />
                            ) : (
                                <CornersOutIcon size={16} />
                            )
                        }
                        label={fullscreenLabel}
                        tooltip={fullscreenLabel}
                        iconOnly
                        testId="view3d-fullscreen"
                    />
                </Panel>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-8">
                <Readout large={isFullscreen} />
                <div className={clsx("flex max-w-full min-w-0", fade)}>
                    <CameraBar />
                </div>
            </div>
        </div>
    );
}
