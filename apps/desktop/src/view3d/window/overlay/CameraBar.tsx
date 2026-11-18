/**
 * The camera controls (ui.md UI-2): one menu button naming the current
 * camera, which lists the show's cameras for this venue (the kit's defaults
 * until the show changes them) with their number keys, then "Edit cameras…",
 * which opens the Cameras panel; then "Pick a seat" and "Follow a performer"
 * (P). While following, the menu button names the performer, and two more
 * buttons switch to their point of view (V) and stop following (Esc). Where
 * the Director is
 * available it is the menu's first item: a camera track that follows the
 * show. Camera movement belongs to the rig (P3.2); this only calls its store.
 * In the touch layout the number keys show only once a hardware keyboard has
 * been used (#880).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import {
    ArmchairIcon,
    CaretDownIcon,
    CheckIcon,
    EyeIcon,
    FilmSlateIcon,
    PencilSimpleIcon,
    PersonSimpleWalkIcon,
    VideoCameraIcon,
    XIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import Shortcut from "@/components/ui/Shortcut";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import { useCameraStore } from "../camera/cameraStore";
import { FOLLOW_KEY, POV_KEY, useFollowStore } from "../camera/followStore";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import {
    directorAvailable,
    toggleDirector,
    useDirectorStore,
} from "../cinema/directorStore";
import { useView3dSceneStore } from "../sceneStore";
import { Panel, PanelSeparator, ToggleButton } from "./Panel";
import { useCameraList } from "./useCameraList";
import { MENU_SEPARATOR_CLASS } from "@/components/ui/popupClasses";

const ITEM_CLASS =
    "rounded-4 text-body data-[highlighted]:bg-text/10 data-[disabled]:text-text/40 flex h-28 cursor-pointer items-center gap-8 px-8 outline-hidden select-none data-[disabled]:cursor-default";

export function CameraBar({
    onEdit,
}: {
    /** Opens the Cameras panel. */
    onEdit: () => void;
}) {
    const { t } = useTranslate();
    const kit = useView3dSceneStore((s) => s.kit);
    const list = useCameraList();
    const { cameras } = list;
    const activeCameraId = useCameraStore((s) => s.activeCameraId);
    const selectCamera = useCameraStore((s) => s.selectCamera);
    const pickMode = useCameraStore((s) => s.pickMode);
    const setPickMode = useCameraStore((s) => s.setPickMode);
    const directing = useDirectorStore((s) => s.directing);
    const pickingPerformer = useFollowStore((s) => s.picking);
    const setPickingPerformer = useFollowStore((s) => s.setPicking);
    const follow = useFollowStore((s) => s.follow);
    const toggleFollowMode = useFollowStore((s) => s.toggleMode);
    const stopFollowing = useFollowStore((s) => s.stop);
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const followed = follow
        ? marchers?.find((m) => m.id === follow.marcherId)
        : undefined;
    // A performer deleted from the show can't be followed any more.
    useEffect(() => {
        if (follow && marchers && !followed) stopFollowing();
    }, [follow, marchers, followed, stopFollowing]);
    const showHints = useShowShortcutHints();
    if (!kit) return null;

    const label = t("view3d.overlay.cameras");
    const active = cameras.find((camera) => camera.id === activeCameraId);
    const canPick = kit.pickTargets.length > 0;
    const canFollow = (marchers?.length ?? 0) > 0;
    const followedName = followed
        ? followed.name
            ? `${followed.drill_number} ${followed.name}`
            : followed.drill_number
        : "";
    return (
        <Panel label={label} testId="view3d-camera-bar">
            <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                    aria-label={label}
                    data-testid="view3d-camera-menu"
                    data-camera={activeCameraId ?? ""}
                    data-directing={directing ? "true" : "false"}
                    data-following={follow?.mode ?? ""}
                    className="rounded-4 text-body hover:bg-text/10 data-[state=open]:bg-text/10 focus-visible:outline-accent flex h-28 min-w-0 items-center gap-6 px-8 whitespace-nowrap outline-hidden focus-visible:outline-2"
                >
                    {directing ? (
                        <FilmSlateIcon size={16} className="shrink-0" />
                    ) : follow?.mode === "pov" ? (
                        <EyeIcon size={16} className="shrink-0" />
                    ) : follow ? (
                        <PersonSimpleWalkIcon size={16} className="shrink-0" />
                    ) : (
                        <VideoCameraIcon size={16} className="shrink-0" />
                    )}
                    <span className="truncate">
                        {directing
                            ? t("view3d.overlay.director")
                            : follow?.mode === "pov"
                              ? t("view3d.overlay.povOf", {
                                    name: followedName,
                                })
                              : follow
                                ? t("view3d.overlay.following", {
                                      name: followedName,
                                  })
                                : active
                                  ? list.label(active)
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
                        {directorAvailable() && (
                            <>
                                <DropdownMenu.Item
                                    data-testid="view3d-camera-director"
                                    data-state={directing ? "on" : "off"}
                                    onSelect={toggleDirector}
                                    className={clsx(
                                        ITEM_CLASS,
                                        directing && "text-accent",
                                    )}
                                >
                                    <CheckIcon
                                        size={14}
                                        className={clsx(
                                            "shrink-0",
                                            !directing && "invisible",
                                        )}
                                    />
                                    <span className="flex-1 truncate">
                                        {t("view3d.overlay.director")}
                                    </span>
                                    {showHints && <Shortcut keys={["D"]} />}
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            </>
                        )}
                        {cameras.length === 0 && (
                            <p className="text-body text-text/60 px-8 py-4">
                                {t("view3d.cameras.none")}
                            </p>
                        )}
                        {cameras.map((camera, index) => {
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
                                        ITEM_CLASS,
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
                                    <span className="flex-1 truncate">
                                        {list.label(camera)}
                                    </span>
                                    {showHints && index < 9 && (
                                        <Shortcut keys={[String(index + 1)]} />
                                    )}
                                </DropdownMenu.Item>
                            );
                        })}
                        <DropdownMenu.Separator
                            className={MENU_SEPARATOR_CLASS}
                        />
                        <DropdownMenu.Item
                            onSelect={onEdit}
                            data-testid="view3d-camera-edit"
                            className={ITEM_CLASS}
                        >
                            <PencilSimpleIcon size={14} className="shrink-0" />
                            <span className="flex-1">
                                {t("view3d.cameras.edit")}
                            </span>
                        </DropdownMenu.Item>
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
            {canFollow && (
                <>
                    {!canPick && <PanelSeparator />}
                    <ToggleButton
                        pressed={pickingPerformer}
                        onClick={() => setPickingPerformer(!pickingPerformer)}
                        icon={<PersonSimpleWalkIcon size={16} />}
                        label={t("view3d.overlay.followPerformer")}
                        tooltip={t("view3d.overlay.followPerformerTooltip")}
                        shortcut={FOLLOW_KEY}
                        iconOnly
                        testId="view3d-follow-performer"
                    />
                </>
            )}
            {follow && (
                <>
                    <PanelSeparator />
                    <ToggleButton
                        pressed={follow.mode === "pov"}
                        onClick={toggleFollowMode}
                        icon={<EyeIcon size={16} />}
                        label={t("view3d.overlay.pointOfView")}
                        tooltip={t("view3d.overlay.pointOfViewTooltip")}
                        shortcut={POV_KEY}
                        iconOnly
                        testId="view3d-follow-pov"
                    />
                    <ToggleButton
                        onClick={stopFollowing}
                        icon={<XIcon size={16} />}
                        label={t("view3d.overlay.stopFollowing")}
                        tooltip={t("view3d.overlay.stopFollowing")}
                        // From their eyes, Esc only backs out behind them.
                        shortcut={follow.mode === "third" ? "Esc" : undefined}
                        iconOnly
                        testId="view3d-follow-stop"
                    />
                </>
            )}
        </Panel>
    );
}
