/**
 * The 3D View window's overlay (ui.md UI-2, UI-4, UI-5, UI-6), floating over
 * the scene:
 *
 * - top left: the camera menu and Pick a seat;
 * - top right: fullscreen and the settings button, with the settings panel
 *   under them when open;
 * - bottom left: playback controls, then the readout.
 *
 * In fullscreen, everything but the readout hides after 3 s without pointer
 * movement (not while the settings panel is open), and the readout grows.
 *
 * Keys: Space, Q, E, Shift+Q and Shift+E run the editor's playback actions,
 * F toggles fullscreen and C the crowd. Esc closes the settings panel, then
 * leaves fullscreen. The camera rig (P3.2) owns 1–9, and Esc for
 * pick-a-seat.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import {
    CornersInIcon,
    CornersOutIcon,
    GearSixIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { useCameraStore } from "../camera/cameraStore";
import { CameraBar } from "./CameraBar";
import { Panel, ToggleButton } from "./Panel";
import { playbackActionForKey } from "./playback";
import { Readout } from "./Readout";
import { SettingsPanel } from "./SettingsPanel";
import { TransportBar } from "./TransportBar";
import { useFullscreen, usePointerIdle } from "./useFullscreen";
import { useVenueRequest } from "./VenueControls";

/** True when a key press is meant for a text field or another control. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        // An open menu uses Space and Enter to choose.
        !!target.closest('[role="menu"]')
    );
}

/**
 * Space, Q and E (with or without Shift) ask the editor to play, pause or
 * step, with the editor's own shortcuts. This listens in the capture phase
 * and cancels the key, so Space never also presses the focused button.
 */
function usePlaybackShortcuts() {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target)) return;
            const action = playbackActionForKey(event);
            if (!action) return;
            event.preventDefault();
            // Holding Q or E steps through pages; holding Space doesn't flicker.
            if (event.repeat && action === "playPause") return;
            window.view3d.requestPlayback(action);
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () =>
            window.removeEventListener("keydown", onKeyDown, {
                capture: true,
            });
    }, []);
}

/**
 * F toggles fullscreen and C the crowd. Esc closes the settings panel, else
 * leaves fullscreen, unless the rig used it to cancel pick-a-seat.
 */
function useOverlayShortcuts(
    toggleFullscreen: () => void,
    settingsOpen: boolean,
    closeSettings: () => void,
) {
    const { settings, request } = useVenueRequest();
    const latest = useRef({
        settings,
        request,
        toggleFullscreen,
        settingsOpen,
        closeSettings,
    });
    latest.current = {
        settings,
        request,
        toggleFullscreen,
        settingsOpen,
        closeSettings,
    };

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
            const current = latest.current;
            if (key === "f") {
                event.preventDefault();
                current.toggleFullscreen();
            } else if (key === "c" && current.settings) {
                event.preventDefault();
                current.request({
                    kind: "crowd",
                    crowd: !current.settings.crowd,
                });
            } else if (
                key === "escape" &&
                !event.defaultPrevented &&
                // The rig cancels pick-a-seat on this Esc instead.
                !useCameraStore.getState().pickMode
            ) {
                if (current.settingsOpen) {
                    event.preventDefault();
                    current.closeSettings();
                } else if (document.fullscreenElement) {
                    void document.exitFullscreen();
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}

export default function View3dOverlay() {
    const { t } = useTranslate();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { isFullscreen, toggleFullscreen } = useFullscreen();
    const hidden = usePointerIdle(isFullscreen && !settingsOpen);
    const closeSettings = () => setSettingsOpen(false);
    usePlaybackShortcuts();
    useOverlayShortcuts(toggleFullscreen, settingsOpen, closeSettings);

    const fade = clsx(
        "motion-safe:transition-opacity motion-safe:duration-300",
        hidden && "opacity-0 [&_*]:pointer-events-none!",
    );
    const fullscreenLabel = t(
        isFullscreen
            ? "view3d.overlay.exitFullscreen"
            : "view3d.overlay.enterFullscreen",
    );
    const settingsLabel = t("view3d.settings.title");

    return (
        <div
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
                    "flex min-h-0 flex-1 items-start justify-between gap-8",
                    fade,
                )}
            >
                <CameraBar />
                <div className="flex max-h-full min-h-0 flex-col items-end gap-8">
                    <Panel>
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
                        <ToggleButton
                            pressed={settingsOpen}
                            onClick={() => setSettingsOpen((open) => !open)}
                            icon={<GearSixIcon size={16} />}
                            label={settingsLabel}
                            tooltip={settingsLabel}
                            tooltipSide="left"
                            iconOnly
                            testId="view3d-settings-button"
                        />
                    </Panel>
                    {settingsOpen && (
                        <SettingsPanel
                            onClose={closeSettings}
                            className="min-h-0"
                        />
                    )}
                </div>
            </div>
            <div className="flex min-w-0 items-end gap-8">
                <div className={fade}>
                    <TransportBar />
                </div>
                <Readout large={isFullscreen} />
            </div>
        </div>
    );
}
