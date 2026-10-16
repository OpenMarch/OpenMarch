/**
 * The Cameras panel: the show's camera list for this venue, and this
 * computer's camera profiles. Opened from the camera menu ("Edit cameras…"
 * or "Save current view"), it floats under the camera menu so the viewer can
 * move the view and save it.
 *
 * - The profile picker at the top says where the list came from (the venue's
 *   defaults, this show, or a profile) and switches between them. A line
 *   under it offers what fits: save the show's list as a profile, update the
 *   profile after editing, take a newer version of the profile, or add a
 *   profile this computer doesn't have.
 * - Each row is one camera, in menu order (the number is its key, and the
 *   view opens on the first): go there, rename it, set it to the current
 *   view, move it up or down, or remove it (with Undo for a few seconds).
 * - "Add current view" saves where the view is now; "Reset to defaults" puts
 *   the venue's own cameras back.
 * - "Manage profiles…" lists every profile on this computer to rename, use
 *   or delete.
 *
 * Camera edits are saved with the show but aren't undoable from the editor,
 * so anything that would throw away a list not saved anywhere else asks
 * first.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    ArrowCounterClockwiseIcon,
    ArrowDownIcon,
    ArrowLeftIcon,
    ArrowUpIcon,
    CaretDownIcon,
    CheckIcon,
    CrosshairSimpleIcon,
    FloppyDiskIcon,
    GearSixIcon,
    PlusIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { Button, Input } from "@openmarch/ui";
import clsx from "clsx";
import {
    CAMERA_NAME_MAX,
    MAX_CAMERAS,
    PROFILE_NAME_MAX,
    replacingLosesWork,
    type CameraProfile,
    type VenueCameras,
    type ViewCamera,
} from "@/view3d/core/cameraList";
import { VENUE_KIT_IDS } from "@/view3d/core/venueSettings";
import { useCameraStore } from "../camera/cameraStore";
import { ToggleButton } from "./Panel";
import { useCameraList, type CameraList } from "./useCameraList";

/** How long "Removed … Undo" stays. */
const UNDO_MS = 8000;

const MENU_ITEM_CLASS =
    "rounded-4 text-body data-[highlighted]:bg-text/10 data-[disabled]:text-text/40 flex h-28 cursor-pointer items-center gap-8 px-8 outline-hidden select-none data-[disabled]:cursor-default";

interface Pending {
    message: string;
    confirm: string;
    run: () => void;
}

// eslint-disable-next-line max-lines-per-function
export function CamerasPanel({
    onClose,
    focusId,
    onFocused,
    className,
}: {
    onClose: () => void;
    /** A camera whose name field takes focus when it appears, to name it. */
    focusId: string | null;
    onFocused: () => void;
    className?: string;
}) {
    const { t } = useTranslate();
    const list = useCameraList();
    const activeCameraId = useCameraStore((s) => s.activeCameraId);
    const [view, setView] = useState<"cameras" | "profiles">("cameras");
    const [pending, setPending] = useState<Pending | null>(null);
    const [naming, setNaming] = useState<string | null>(null);
    const [removed, setRemoved] = useState<{
        name: string;
        previous: VenueCameras | undefined;
    } | null>(null);

    useEffect(() => {
        if (!removed) return;
        const timer = setTimeout(() => setRemoved(null), UNDO_MS);
        return () => clearTimeout(timer);
    }, [removed]);
    // A new venue starts clean.
    useEffect(() => {
        setPending(null);
        setNaming(null);
        setRemoved(null);
    }, [list.kitId]);

    /** Runs a replacement, asking first when it would lose the current list. */
    const replace = (message: string, run: () => void) => {
        setRemoved(null);
        if (replacingLosesWork(list.status))
            setPending({
                message,
                confirm: t("view3d.cameras.replace"),
                run,
            });
        else run();
    };
    const resetToDefaults = () =>
        replace(
            t("view3d.cameras.resetConfirm", { count: list.defaultCount }),
            list.chooseDefaults,
        );
    const chooseProfile = (profile: CameraProfile) =>
        replace(
            t("view3d.cameras.replaceWithProfile", { name: profile.name }),
            () => list.chooseProfile(profile),
        );
    const startNaming = () => {
        const status = list.status;
        setNaming(
            status.kind === "profile"
                ? t("view3d.cameras.copyName", {
                      name: status.localProfile?.name ?? status.profile.name,
                  })
                : t("view3d.cameras.defaultProfileName", {
                      venue: list.kitId ? t(`view3d.kit.${list.kitId}`) : "",
                  }),
        );
        setView("cameras");
    };
    const remove = (camera: ViewCamera) => {
        setRemoved({ name: list.label(camera), previous: list.venueCameras });
        list.edit({ kind: "remove", id: camera.id });
    };

    return (
        <section
            role="dialog"
            aria-label={t("view3d.cameras.title")}
            data-testid="view3d-cameras-panel"
            data-customized={list.customized}
            data-profile-status={list.status.kind}
            className={clsx(
                "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex w-[22rem] max-w-full flex-col overflow-hidden border",
                className,
            )}
        >
            <header className="border-stroke flex items-center justify-between border-b py-6 pr-6 pl-12">
                {view === "profiles" ? (
                    <button
                        type="button"
                        onClick={() => setView("cameras")}
                        data-testid="view3d-profiles-back"
                        className="rounded-4 hover:bg-text/10 focus-visible:outline-accent text-body -ml-6 flex h-28 items-center gap-6 px-6 font-medium outline-hidden focus-visible:outline-2"
                    >
                        <ArrowLeftIcon size={14} />
                        {t("view3d.cameras.profilesTitle")}
                    </button>
                ) : (
                    <h2 className="text-body font-medium">
                        {t("view3d.cameras.title")}
                    </h2>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("view3d.cameras.close")}
                    className="rounded-4 hover:bg-text/10 focus-visible:outline-accent flex size-28 items-center justify-center outline-hidden focus-visible:outline-2"
                >
                    <XIcon size={16} />
                </button>
            </header>
            {view === "profiles" ? (
                <ManageProfiles
                    list={list}
                    onUse={(profile) => {
                        setView("cameras");
                        chooseProfile(profile);
                    }}
                />
            ) : (
                <>
                    <div className="border-stroke flex flex-col gap-6 border-b p-8">
                        <ProfilePicker
                            list={list}
                            onDefaults={resetToDefaults}
                            onProfile={chooseProfile}
                            onSaveAs={startNaming}
                            onManage={() => setView("profiles")}
                        />
                        {naming !== null ? (
                            <SaveAsRow
                                initial={naming}
                                onCancel={() => setNaming(null)}
                                onSave={(name) => {
                                    setNaming(null);
                                    void list
                                        .saveAsProfile(name)
                                        .catch(() => undefined);
                                }}
                            />
                        ) : (
                            <ProfileNotice
                                list={list}
                                onSaveAs={startNaming}
                                onTakeNewer={(profile) =>
                                    replace(
                                        t("view3d.cameras.replaceWithProfile", {
                                            name: profile.name,
                                        }),
                                        () => list.chooseProfile(profile),
                                    )
                                }
                            />
                        )}
                    </div>
                    <div className="flex min-h-0 flex-col gap-8 overflow-y-auto p-12">
                        {list.cameras.length === 0 ? (
                            <p
                                className="text-body text-text/60 py-8"
                                data-testid="view3d-cameras-empty"
                            >
                                {t("view3d.cameras.empty")}
                            </p>
                        ) : (
                            <ol className="flex flex-col gap-2">
                                {list.cameras.map((camera, index) => (
                                    <CameraRow
                                        key={camera.id}
                                        camera={camera}
                                        index={index}
                                        count={list.cameras.length}
                                        active={camera.id === activeCameraId}
                                        list={list}
                                        onRemove={() => remove(camera)}
                                        focus={camera.id === focusId}
                                        onFocused={onFocused}
                                    />
                                ))}
                            </ol>
                        )}
                        <p className="text-sub text-text/60">
                            {t("view3d.cameras.hint")}
                        </p>
                    </div>
                    <footer className="border-stroke flex flex-col gap-8 border-t p-8">
                        {pending ? (
                            <Confirm
                                message={pending.message}
                                confirm={pending.confirm}
                                onCancel={() => setPending(null)}
                                onConfirm={() => {
                                    pending.run();
                                    setPending(null);
                                }}
                            />
                        ) : (
                            <>
                                {removed && (
                                    <div
                                        className="text-body flex items-center justify-between gap-8 px-4"
                                        data-testid="view3d-cameras-removed"
                                    >
                                        <span className="truncate">
                                            {t("view3d.cameras.removed", {
                                                name: removed.name,
                                            })}
                                        </span>
                                        <LinkButton
                                            onClick={() => {
                                                list.restore(removed.previous);
                                                setRemoved(null);
                                            }}
                                            testId="view3d-cameras-undo-remove"
                                        >
                                            {t("view3d.cameras.undo")}
                                        </LinkButton>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-8">
                                    <ToggleButton
                                        onClick={() => list.addCurrentView()}
                                        icon={<PlusIcon size={16} />}
                                        label={t("view3d.cameras.addView")}
                                        tooltip={
                                            list.full
                                                ? t("view3d.cameras.full", {
                                                      max: MAX_CAMERAS,
                                                  })
                                                : t(
                                                      "view3d.cameras.addViewTooltip",
                                                  )
                                        }
                                        tooltipSide="top"
                                        disabled={!list.ready || list.full}
                                        testId="view3d-cameras-add"
                                    />
                                    <ToggleButton
                                        onClick={resetToDefaults}
                                        icon={
                                            <ArrowCounterClockwiseIcon
                                                size={16}
                                            />
                                        }
                                        label={t("view3d.cameras.reset")}
                                        tooltip={
                                            list.customized
                                                ? t(
                                                      "view3d.cameras.resetTooltip",
                                                  )
                                                : t(
                                                      "view3d.cameras.alreadyDefaults",
                                                  )
                                        }
                                        tooltipSide="top"
                                        disabled={
                                            !list.ready || !list.customized
                                        }
                                        testId="view3d-cameras-reset"
                                    />
                                </div>
                            </>
                        )}
                    </footer>
                </>
            )}
        </section>
    );
}

/** The current source of the list, and the menu that switches it. */
function ProfilePicker({
    list,
    onDefaults,
    onProfile,
    onSaveAs,
    onManage,
}: {
    list: CameraList;
    onDefaults: () => void;
    onProfile: (profile: CameraProfile) => void;
    onSaveAs: () => void;
    onManage: () => void;
}) {
    const { t } = useTranslate();
    const status = list.status;
    const venueProfiles = list.profiles.filter((p) => p.kit === list.kitId);
    const currentName =
        status.kind === "defaults"
            ? t("view3d.cameras.source.defaults")
            : status.kind === "custom"
              ? t("view3d.cameras.source.custom")
              : (status.localProfile?.name ?? status.profile.name);
    const currentProfileId =
        status.kind === "profile" ? status.profile.id : null;

    return (
        <div className="flex items-center gap-8">
            <span className="text-sub text-text/60 shrink-0">
                {t("view3d.cameras.profile")}
            </span>
            <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                    disabled={!list.ready}
                    data-testid="view3d-profile-picker"
                    data-value={currentProfileId ?? status.kind}
                    className="rounded-4 border-stroke text-body hover:bg-text/10 data-[state=open]:bg-text/10 focus-visible:outline-accent flex h-28 min-w-0 flex-1 items-center gap-6 border px-8 outline-hidden focus-visible:outline-2"
                >
                    <span className="truncate">{currentName}</span>
                    {status.kind === "profile" && status.edited && (
                        <span
                            className="text-sub text-accent shrink-0"
                            data-testid="view3d-profile-edited"
                        >
                            {t("view3d.cameras.edited")}
                        </span>
                    )}
                    <CaretDownIcon
                        size={12}
                        className="text-text/60 ml-auto shrink-0"
                    />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="start"
                        sideOffset={6}
                        data-testid="view3d-profile-menu"
                        className="border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text z-50 flex max-h-[60vh] min-w-[16rem] flex-col overflow-y-auto border p-4"
                    >
                        <MenuChoice
                            on={status.kind === "defaults"}
                            onSelect={onDefaults}
                            value="defaults"
                        >
                            {t("view3d.cameras.source.defaults")}
                        </MenuChoice>
                        {status.kind === "custom" && (
                            <MenuChoice on value="custom" disabled>
                                {t("view3d.cameras.source.custom")}
                            </MenuChoice>
                        )}
                        {status.kind === "profile" && !status.localProfile && (
                            <MenuChoice on value={status.profile.id} disabled>
                                {status.profile.name}
                            </MenuChoice>
                        )}
                        {venueProfiles.length > 0 && (
                            <DropdownMenu.Label className="text-sub text-text/60 px-8 pt-6 pb-2">
                                {t("view3d.cameras.myProfiles")}
                            </DropdownMenu.Label>
                        )}
                        {venueProfiles.map((profile) => (
                            <MenuChoice
                                key={profile.id}
                                on={profile.id === currentProfileId}
                                onSelect={() => onProfile(profile)}
                                value={profile.id}
                            >
                                {profile.name}
                            </MenuChoice>
                        ))}
                        <DropdownMenu.Separator className="bg-stroke mx-4 my-4 h-px" />
                        <DropdownMenu.Item
                            onSelect={onSaveAs}
                            data-testid="view3d-profile-save-as"
                            className={MENU_ITEM_CLASS}
                        >
                            <FloppyDiskIcon size={14} className="shrink-0" />
                            {t("view3d.cameras.saveAsProfile")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                            onSelect={onManage}
                            data-testid="view3d-profile-manage"
                            className={MENU_ITEM_CLASS}
                        >
                            <GearSixIcon size={14} className="shrink-0" />
                            {t("view3d.cameras.manageProfiles")}
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}

function MenuChoice({
    on,
    onSelect,
    value,
    disabled,
    children,
}: {
    on: boolean;
    onSelect?: () => void;
    value: string;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <DropdownMenu.Item
            disabled={disabled}
            onSelect={onSelect}
            data-value={value}
            data-state={on ? "on" : "off"}
            className={clsx(MENU_ITEM_CLASS, on && "text-accent")}
        >
            <CheckIcon
                size={14}
                className={clsx("shrink-0", !on && "invisible")}
            />
            <span className="truncate">{children}</span>
        </DropdownMenu.Item>
    );
}

/** One line under the picker: what the list's source means, and what to do next. */
function ProfileNotice({
    list,
    onSaveAs,
    onTakeNewer,
}: {
    list: CameraList;
    onSaveAs: () => void;
    onTakeNewer: (profile: CameraProfile) => void;
}) {
    const { t } = useTranslate();
    const status = list.status;
    let text: string;
    let actions: ReactNode = null;
    if (status.kind === "defaults") {
        text = t("view3d.cameras.notice.defaults");
    } else if (status.kind === "custom") {
        text = t("view3d.cameras.notice.custom");
        actions = (
            <LinkButton onClick={onSaveAs} testId="view3d-notice-save-as">
                {t("view3d.cameras.saveAsProfileShort")}
            </LinkButton>
        );
    } else if (status.local === "missing") {
        text = t("view3d.cameras.notice.missing");
        actions = (
            <LinkButton
                onClick={() =>
                    void list.addProfileToComputer().catch(() => undefined)
                }
                testId="view3d-notice-add-profile"
            >
                {t("view3d.cameras.addToMyProfiles")}
            </LinkButton>
        );
    } else if (status.local === "newer" && status.localProfile) {
        const local = status.localProfile;
        text = t("view3d.cameras.notice.newer");
        actions = (
            <LinkButton
                onClick={() => onTakeNewer(local)}
                testId="view3d-notice-take-newer"
            >
                {t("view3d.cameras.useNewVersion")}
            </LinkButton>
        );
    } else if (status.edited) {
        text = t("view3d.cameras.notice.edited");
        actions = (
            <>
                <LinkButton
                    onClick={() =>
                        void list.updateProfile().catch(() => undefined)
                    }
                    testId="view3d-notice-update-profile"
                >
                    {t("view3d.cameras.updateProfile")}
                </LinkButton>
                <LinkButton onClick={onSaveAs} testId="view3d-notice-save-as">
                    {t("view3d.cameras.saveAsNew")}
                </LinkButton>
            </>
        );
    } else {
        text = t("view3d.cameras.notice.profile");
    }
    return (
        <div
            className="text-sub text-text/60 flex flex-wrap items-center gap-x-8 gap-y-2 px-2"
            data-testid="view3d-profile-notice"
        >
            <span>{text}</span>
            {actions}
        </div>
    );
}

/** Names a new profile. */
function SaveAsRow({
    initial,
    onCancel,
    onSave,
}: {
    initial: string;
    onCancel: () => void;
    onSave: (name: string) => void;
}) {
    const { t } = useTranslate();
    const [name, setName] = useState(initial);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);
    const save = () => {
        if (name.trim()) onSave(name.trim());
    };
    return (
        <div className="flex items-center gap-6" data-testid="view3d-save-as">
            <Input
                ref={ref}
                compact
                value={name}
                maxLength={PROFILE_NAME_MAX}
                aria-label={t("view3d.cameras.profileName")}
                data-testid="view3d-save-as-name"
                className="min-w-0 flex-1"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") save();
                    else if (event.key === "Escape") {
                        event.preventDefault();
                        onCancel();
                    }
                }}
            />
            <Button variant="secondary" size="compact" onClick={onCancel}>
                {t("view3d.cameras.cancel")}
            </Button>
            <Button
                size="compact"
                disabled={!name.trim()}
                onClick={save}
                data-testid="view3d-save-as-confirm"
            >
                {t("view3d.cameras.save")}
            </Button>
        </div>
    );
}

/** Every profile on this computer, by venue: rename, use, delete. */
function ManageProfiles({
    list,
    onUse,
}: {
    list: CameraList;
    onUse: (profile: CameraProfile) => void;
}) {
    const { t } = useTranslate();
    const [deleting, setDeleting] = useState<string | null>(null);
    const groups = VENUE_KIT_IDS.map((kit) => ({
        kit,
        profiles: list.profiles.filter((p) => p.kit === kit),
    })).filter((group) => group.profiles.length > 0);
    // This venue first.
    groups.sort(
        (a, b) => Number(b.kit === list.kitId) - Number(a.kit === list.kitId),
    );

    return (
        <div
            className="flex min-h-0 flex-col gap-12 overflow-y-auto p-12"
            data-testid="view3d-profiles"
        >
            <p className="text-sub text-text/60">
                {t("view3d.cameras.profilesHint")}
            </p>
            {groups.length === 0 && (
                <p
                    className="text-body text-text/60"
                    data-testid="view3d-profiles-empty"
                >
                    {t("view3d.cameras.noProfiles")}
                </p>
            )}
            {groups.map((group) => (
                <div key={group.kit} className="flex flex-col gap-4">
                    <h3 className="text-sub text-text/60 font-mono tracking-wide uppercase">
                        {t(`view3d.kit.${group.kit}`)}
                    </h3>
                    <ul className="flex flex-col gap-2">
                        {group.profiles.map((profile) =>
                            deleting === profile.id ? (
                                <li
                                    key={profile.id}
                                    className="flex flex-col gap-6 p-2"
                                >
                                    <Confirm
                                        message={t(
                                            "view3d.cameras.deleteProfileConfirm",
                                            { name: profile.name },
                                        )}
                                        confirm={t(
                                            "view3d.cameras.deleteProfile",
                                        )}
                                        onCancel={() => setDeleting(null)}
                                        onConfirm={() => {
                                            setDeleting(null);
                                            void list
                                                .deleteProfile(profile)
                                                .catch(() => undefined);
                                        }}
                                    />
                                </li>
                            ) : (
                                <li
                                    key={profile.id}
                                    className="flex items-center gap-4 p-2"
                                    data-testid="view3d-profile-row"
                                    data-value={profile.id}
                                >
                                    <NameField
                                        value={profile.name}
                                        maxLength={PROFILE_NAME_MAX}
                                        label={t("view3d.cameras.profileName")}
                                        testId="view3d-profile-name"
                                        onCommit={(name) =>
                                            void list
                                                .renameProfile(profile, name)
                                                .catch(() => undefined)
                                        }
                                    />
                                    <span className="text-sub text-text/60 shrink-0">
                                        {t("view3d.cameras.cameraCount", {
                                            count: profile.cameras.length,
                                        })}
                                    </span>
                                    <Button
                                        variant="secondary"
                                        size="compact"
                                        disabled={profile.kit !== list.kitId}
                                        tooltipText={
                                            profile.kit !== list.kitId
                                                ? t("view3d.cameras.otherVenue")
                                                : undefined
                                        }
                                        onClick={() => onUse(profile)}
                                        data-testid="view3d-profile-use"
                                    >
                                        {t("view3d.cameras.use")}
                                    </Button>
                                    <ToggleButton
                                        onClick={() => setDeleting(profile.id)}
                                        icon={<TrashIcon size={16} />}
                                        label={t(
                                            "view3d.cameras.deleteProfile",
                                        )}
                                        tooltip={t(
                                            "view3d.cameras.deleteProfile",
                                        )}
                                        tooltipSide="left"
                                        iconOnly
                                        testId="view3d-profile-delete"
                                    />
                                </li>
                            ),
                        )}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function CameraRow({
    camera,
    index,
    count,
    active,
    list,
    onRemove,
    focus,
    onFocused,
}: {
    camera: ViewCamera;
    index: number;
    count: number;
    active: boolean;
    list: CameraList;
    onRemove: () => void;
    focus: boolean;
    onFocused: () => void;
}) {
    const { t } = useTranslate();
    const selectCamera = useCameraStore((s) => s.selectCamera);
    const name = list.label(camera);
    const defaultName = camera.labelKey ? t(camera.labelKey) : undefined;

    return (
        <li
            className={clsx(
                "rounded-4 flex items-center gap-4 p-2",
                active && "bg-accent/10",
            )}
            data-testid="view3d-camera-row"
            data-value={camera.id}
            data-state={active ? "on" : "off"}
        >
            <button
                type="button"
                onClick={() => selectCamera(camera.id)}
                aria-label={t("view3d.cameras.goTo", { name })}
                title={t("view3d.cameras.goTo", { name })}
                className={clsx(
                    "rounded-4 border-stroke text-sub hover:bg-text/10 focus-visible:outline-accent flex size-28 shrink-0 items-center justify-center border font-mono outline-hidden focus-visible:outline-2",
                    active && "border-accent text-accent",
                )}
            >
                {index < 9 ? index + 1 : "·"}
            </button>
            <NameField
                value={name}
                placeholder={defaultName}
                focus={focus}
                onFocused={onFocused}
                maxLength={CAMERA_NAME_MAX}
                label={t("view3d.cameras.name")}
                testId="view3d-camera-name"
                onCommit={(next) =>
                    list.edit({ kind: "rename", id: camera.id, name: next })
                }
            />
            <ToggleButton
                onClick={() => list.setToCurrentView(camera.id)}
                icon={<CrosshairSimpleIcon size={16} />}
                label={t("view3d.cameras.setView")}
                tooltip={t("view3d.cameras.setViewTooltip")}
                iconOnly
                testId="view3d-camera-set-view"
            />
            <ToggleButton
                onClick={() =>
                    list.edit({ kind: "move", id: camera.id, by: -1 })
                }
                icon={<ArrowUpIcon size={14} />}
                label={t("view3d.cameras.moveUp")}
                tooltip={t("view3d.cameras.moveUp")}
                iconOnly
                disabled={index === 0}
                testId="view3d-camera-up"
            />
            <ToggleButton
                onClick={() =>
                    list.edit({ kind: "move", id: camera.id, by: 1 })
                }
                icon={<ArrowDownIcon size={14} />}
                label={t("view3d.cameras.moveDown")}
                tooltip={t("view3d.cameras.moveDown")}
                iconOnly
                disabled={index === count - 1}
                testId="view3d-camera-down"
            />
            <ToggleButton
                onClick={onRemove}
                icon={<TrashIcon size={16} />}
                label={t("view3d.cameras.remove")}
                tooltip={t("view3d.cameras.remove")}
                tooltipSide="left"
                iconOnly
                testId="view3d-camera-remove"
            />
        </li>
    );
}

function Confirm({
    message,
    confirm,
    onCancel,
    onConfirm,
}: {
    message: string;
    confirm: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const { t } = useTranslate();
    return (
        <div
            className="flex flex-col gap-8 px-4"
            data-testid="view3d-cameras-confirm"
        >
            <p className="text-body">{message}</p>
            <div className="flex justify-end gap-8">
                <Button variant="secondary" size="compact" onClick={onCancel}>
                    {t("view3d.cameras.cancel")}
                </Button>
                <Button
                    variant="red"
                    size="compact"
                    data-testid="view3d-cameras-confirm-yes"
                    onClick={onConfirm}
                >
                    {confirm}
                </Button>
            </div>
        </div>
    );
}

function LinkButton({
    onClick,
    testId,
    children,
}: {
    onClick: () => void;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className="text-sub text-accent focus-visible:outline-accent rounded-4 shrink-0 font-medium outline-hidden hover:underline focus-visible:outline-2"
        >
            {children}
        </button>
    );
}

/**
 * A name saved on Enter or when focus leaves, so one rename is one change;
 * Esc puts the saved name back. With a placeholder (a default camera's own
 * label), clearing the name gives the label back; without one, an empty
 * name is ignored.
 */
function NameField({
    value,
    placeholder,
    focus = false,
    onFocused,
    maxLength,
    label,
    testId,
    onCommit,
}: {
    value: string;
    placeholder?: string;
    focus?: boolean;
    onFocused?: () => void;
    maxLength: number;
    label: string;
    testId: string;
    onCommit: (name: string) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    useEffect(() => {
        if (!focus || !ref.current) return;
        ref.current.focus();
        ref.current.select();
        onFocused?.();
    }, [focus, onFocused]);

    const commit = () => {
        const name = draft.trim();
        if (!name && !placeholder) setDraft(value);
        else if (name !== value) onCommit(name);
        else setDraft(value);
    };
    return (
        <Input
            ref={ref}
            compact
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={label}
            data-testid={testId}
            className="hover:border-stroke focus:border-accent min-w-0 flex-1 border-transparent bg-transparent"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.currentTarget.blur();
                } else if (event.key === "Escape") {
                    setDraft(value);
                    event.preventDefault();
                }
            }}
        />
    );
}
