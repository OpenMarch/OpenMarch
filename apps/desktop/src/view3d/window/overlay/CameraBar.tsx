/**
 * The camera controls (ui.md UI-2): one menu button naming the current
 * camera, which lists the kit's named cameras with their number keys, then
 * "Pick a seat". Camera movement belongs to the rig (P3.2); this only calls
 * its store.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslate } from "@tolgee/react";
import {
    ArmchairIcon,
    CaretDownIcon,
    CheckIcon,
    VideoCameraIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { useCameraStore } from "../camera/cameraStore";
import { useView3dSceneStore } from "../sceneStore";
import { Panel, PanelSeparator, ToggleButton } from "./Panel";

export function CameraBar() {
    const { t } = useTranslate();
    const kit = useView3dSceneStore((s) => s.kit);
    const activeCameraId = useCameraStore((s) => s.activeCameraId);
    const selectCamera = useCameraStore((s) => s.selectCamera);
    const pickMode = useCameraStore((s) => s.pickMode);
    const setPickMode = useCameraStore((s) => s.setPickMode);
    if (!kit) return null;

    const label = t("view3d.overlay.cameras");
    const active = kit.cameras.find((camera) => camera.id === activeCameraId);
    const canPick = kit.pickTargets.length > 0;
    return (
        <Panel label={label} testId="view3d-camera-bar">
            <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                    aria-label={label}
                    data-testid="view3d-camera-menu"
                    data-camera={activeCameraId ?? ""}
                    className="rounded-4 text-body hover:bg-text/10 data-[state=open]:bg-text/10 focus-visible:outline-accent flex h-28 min-w-0 items-center gap-6 px-8 whitespace-nowrap outline-hidden focus-visible:outline-2"
                >
                    <VideoCameraIcon size={16} className="shrink-0" />
                    <span className="truncate">
                        {active
                            ? t(active.labelKey)
                            : t("view3d.overlay.freeCamera")}
                    </span>
                    <CaretDownIcon size={12} className="text-text/60" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="start"
                        sideOffset={8}
                        data-testid="view3d-camera-picker"
                        className="border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text z-50 flex min-w-[13rem] flex-col border p-4"
                    >
                        {kit.cameras.map((camera, index) => {
                            const on = camera.id === activeCameraId;
                            return (
                                <DropdownMenu.Item
                                    key={camera.id}
                                    data-value={camera.id}
                                    data-state={on ? "on" : "off"}
                                    // Choosing the current camera again flies
                                    // back to it after orbiting nearby.
                                    onSelect={() => selectCamera(camera.id)}
                                    className={clsx(
                                        "rounded-4 text-body data-[highlighted]:bg-text/10 flex h-28 cursor-pointer items-center gap-8 px-8 outline-hidden select-none",
                                        on && "text-accent",
                                    )}
                                >
                                    <CheckIcon
                                        size={14}
                                        className={clsx(
                                            "shrink-0",
                                            !on && "invisible",
                                        )}
                                    />
                                    <span className="flex-1">
                                        {t(camera.labelKey)}
                                    </span>
                                    {index < 9 && (
                                        <kbd className="text-sub text-text/60 font-mono">
                                            {index + 1}
                                        </kbd>
                                    )}
                                </DropdownMenu.Item>
                            );
                        })}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {canPick && (
                <>
                    <PanelSeparator />
                    <ToggleButton
                        pressed={pickMode}
                        onClick={() => setPickMode(!pickMode)}
                        icon={<ArmchairIcon size={16} />}
                        label={t("view3d.overlay.pickSeat")}
                        tooltip={t("view3d.overlay.pickSeatTooltip")}
                        iconOnly
                        testId="view3d-pick-seat"
                    />
                </>
            )}
        </Panel>
    );
}
