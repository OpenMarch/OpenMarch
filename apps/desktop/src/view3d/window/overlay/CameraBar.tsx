/**
 * The camera bar (ui.md UI-2): the kit's named cameras, then "Pick a seat".
 * Camera movement belongs to the rig (P3.2); this only calls its store.
 */
import { useTranslate } from "@tolgee/react";
import { ArmchairIcon } from "@phosphor-icons/react";
import { useCameraStore } from "../camera/cameraStore";
import { useView3dSceneStore } from "../sceneStore";
import {
    Panel,
    PanelLabel,
    PanelSeparator,
    Segmented,
    ToggleButton,
} from "./Panel";

export function CameraBar() {
    const { t } = useTranslate();
    const kit = useView3dSceneStore((s) => s.kit);
    const activeCameraId = useCameraStore((s) => s.activeCameraId);
    const selectCamera = useCameraStore((s) => s.selectCamera);
    const pickMode = useCameraStore((s) => s.pickMode);
    const setPickMode = useCameraStore((s) => s.setPickMode);
    if (!kit) return null;

    const label = t("view3d.overlay.cameras");
    const canPick = kit.pickTargets.length > 0;
    return (
        <Panel
            label={label}
            testId="view3d-camera-bar"
            className="max-w-full overflow-x-auto [scrollbar-width:none]"
        >
            <PanelLabel>{label}</PanelLabel>
            <Segmented
                value={activeCameraId}
                options={kit.cameras.map((camera, index) => ({
                    value: camera.id,
                    label: t(camera.labelKey),
                    title: index < 9 ? `${index + 1}` : undefined,
                }))}
                onChange={selectCamera}
                label={label}
                testId="view3d-camera-picker"
            />
            {canPick && (
                <>
                    <PanelSeparator />
                    <ToggleButton
                        pressed={pickMode}
                        onClick={() => setPickMode(!pickMode)}
                        icon={<ArmchairIcon size={16} />}
                        label={t("view3d.overlay.pickSeat")}
                        tooltip={t("view3d.overlay.pickSeatTooltip")}
                        testId="view3d-pick-seat"
                    />
                </>
            )}
        </Panel>
    );
}
