import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import clsx from "clsx";
import {
    ArrowsOutIcon,
    CaretDownIcon,
    CrosshairSimpleIcon,
    DotsSixVerticalIcon,
    EqualsIcon,
    HandIcon,
    LassoIcon,
    MagicWandIcon,
    MagnetIcon,
    MinusCircleIcon,
    PlusCircleIcon,
    QuestionIcon,
    SelectionIcon,
    type Icon,
} from "@phosphor-icons/react";
import { LongPressBubble, useLongPress } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import type { FieldMarchers } from "@/field/three/fieldMarchers";
import { fieldToElement, useFieldViewStore } from "@/field/three/fieldView";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import {
    useTouchModifierStore,
    type TouchToggle,
} from "@/stores/TouchModifierStore";
import {
    MENU_BUTTON_CLASS,
    MENU_CONTENT_CLASS,
    MENU_LABEL_CLASS,
} from "@/components/ui/popupClasses";
import { choosePillPosition, PILL_EDGE, type Rect } from "./pillPlacement";
import {
    fieldLayersIn,
    NO_FIELD_OBSTACLES,
    noteFieldLayersChanged,
    obstaclesKey,
    overlaps,
    PILL_AVOIDS,
    type FieldObstacleSource,
    SAVED_PILL_YIELDS_TO,
    subscribeFieldLayers,
} from "@/components/canvas/fieldLayers";
import { useFieldDragModeStore, type FieldDragMode } from "./fieldDragMode";
import { swallowPress } from "./swallowPress";

export const TOUCH_MODIFIER_POSITION_KEY = "openmarch:touchModifierPosition";

/** Held this long with nothing else pressed: explain instead */
const EXPLAIN_MS = 500;

/** How long the view must stay still before the pill finds its spot again */
const PLACE_AFTER_VIEW_MS = 300;

interface Position {
    /** Distance from the left edge of the field (px) */
    left: number;
    /** Distance from the bottom edge of the field (px) */
    bottom: number;
}

export const parseModifierPosition = (raw: string | null): Position | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (
            typeof parsed.left === "number" &&
            typeof parsed.bottom === "number" &&
            Number.isFinite(parsed.left) &&
            Number.isFinite(parsed.bottom)
        ) {
            return { left: parsed.left, bottom: parsed.bottom };
        }
    } catch {
        // Fall through to the default
    }
    return null;
};

const readStorage = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};
const writeStorage = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage may be unavailable; keep it for this session
    }
};

/** The pill's toggles, in order: the held roles, then Add and Subtract. Named by role, never by key. */
const TOGGLES: readonly {
    toggle: TouchToggle;
    label: string;
    /** What it does and how to use it: the button's description (`title`) */
    hint: string;
    Icon: Icon;
}[] = [
    {
        toggle: "fine",
        label: "touch.modifiers.fine",
        hint: "touch.modifiers.fineHint",
        Icon: CrosshairSimpleIcon,
    },
    {
        toggle: "constrain",
        label: "touch.modifiers.constrain",
        hint: "touch.modifiers.constrainHint",
        Icon: EqualsIcon,
    },
    {
        toggle: "fromCenter",
        label: "touch.modifiers.fromCenter",
        hint: "touch.modifiers.fromCenterHint",
        Icon: ArrowsOutIcon,
    },
    {
        toggle: "add",
        label: "touch.modifiers.add",
        hint: "touch.modifiers.addHint",
        Icon: PlusCircleIcon,
    },
    {
        toggle: "subtract",
        label: "touch.modifiers.subtract",
        hint: "touch.modifiers.subtractHint",
        Icon: MinusCircleIcon,
    },
];

/** Apple Pencil on Apple devices, a pen elsewhere: the `device` param of the drag mode texts */
const PEN_DEVICE: "pencil" | "pen" =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
        ? "pencil"
        : "pen";

/** The drag modes in the menu's order, with their name, what they do and icon */
const DRAG_MODES: readonly {
    mode: FieldDragMode;
    label: string;
    describe: string;
    Icon: Icon;
}[] = [
    {
        mode: "auto",
        label: "touch.dragMode.auto",
        describe: "touch.dragMode.autoDescribe",
        Icon: MagicWandIcon,
    },
    {
        mode: "box",
        label: "touch.dragMode.box",
        describe: "touch.dragMode.boxDescribe",
        Icon: SelectionIcon,
    },
    {
        mode: "lasso",
        label: "touch.dragMode.lasso",
        describe: "touch.dragMode.lassoDescribe",
        Icon: LassoIcon,
    },
    {
        mode: "pan",
        label: "touch.dragMode.pan",
        describe: "touch.dragMode.panDescribe",
        Icon: HandIcon,
    },
];

const EXPLAIN = {
    grip: "touch.modifiers.explain.grip",
    fine: "touch.modifiers.explain.fine",
    constrain: "touch.modifiers.explain.constrain",
    fromCenter: "touch.modifiers.explain.fromCenter",
    add: "touch.modifiers.explain.add",
    subtract: "touch.modifiers.explain.subtract",
    dragMode: "touch.modifiers.explain.dragMode",
    snap: "touch.modifiers.explain.snap",
    help: "touch.modifiers.explain.help",
} as const satisfies Record<
    TouchToggle | "grip" | "dragMode" | "snap" | "help",
    string
>;
type Explained = keyof typeof EXPLAIN;

const HELP = [
    "touch.modifiers.helpList.toggles",
    "touch.modifiers.helpList.fine",
    "touch.modifiers.helpList.fromCenter",
    "touch.modifiers.helpList.add",
    "touch.modifiers.helpList.dragMode",
] as const;

/**
 * A toggle on the pill: press-and-hold holds it while another finger or the Pencil works; a
 * press with nothing else pressed latches it on until tapped again, or, held for half a second,
 * explains the button instead.
 */
function useTogglePress(toggle: TouchToggle, onExplain: () => void) {
    const setHeld = useTouchModifierStore((s) => s.setHeld);
    const toggleLatched = useTouchModifierStore((s) => s.toggleLatched);
    const release = useTouchModifierStore((s) => s.release);
    const press = useRef<{
        at: number;
        id: number;
        otherPress: boolean;
        timer: ReturnType<typeof setTimeout> | null;
        stopWatching: () => void;
    } | null>(null);

    const finish = () => {
        const p = press.current;
        press.current = null;
        if (!p) return null;
        if (p.timer !== null) clearTimeout(p.timer);
        p.stopWatching();
        return p;
    };
    useEffect(() => () => void finish(), []);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety
        }
        finish();
        const id = e.pointerId;
        // Another finger or the Pencil pressing meanwhile means the hold is being used
        const watch = (other: PointerEvent) => {
            if (other.pointerId !== id && press.current)
                press.current.otherPress = true;
        };
        window.addEventListener("pointerdown", watch, true);
        const p = {
            // The event's own time: a busy page must not turn a tap into a hold
            at: e.timeStamp > 0 ? e.timeStamp : performance.now(),
            id,
            otherPress: false,
            timer: null as ReturnType<typeof setTimeout> | null,
            stopWatching: () =>
                window.removeEventListener("pointerdown", watch, true),
        };
        if (e.pointerType !== "mouse") {
            p.timer = setTimeout(() => {
                p.timer = null;
                // After any release the browser has queued
                requestAnimationFrame(() => {
                    if (press.current === p && !p.otherPress) onExplain();
                });
            }, EXPLAIN_MS);
        }
        press.current = p;
        setHeld(toggle, true);
    };
    const end = (e: React.PointerEvent<HTMLButtonElement>, tap: boolean) => {
        e.stopPropagation();
        const p = finish();
        if (!p) return;
        const now = e.timeStamp > 0 ? e.timeStamp : performance.now();
        // Released before the explanation, with nothing else pressed: a tap
        release(toggle, tap && !p.otherPress && now - p.at < EXPLAIN_MS);
    };
    return {
        onPointerDown,
        onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => end(e, true),
        onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
            end(e, false),
        // The finger's release can be swallowed (the pen palm guard takes a
        // finger that was down when the pen landed), but capture still ends:
        // let go of the toggle then, or it stays held
        onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
            if (press.current?.id === e.pointerId) end(e, false);
        },
        // VoiceOver, Voice Control and Switch Control press a button with a
        // click and no pointer (detail 0); a tap's own click (detail 1) was
        // the pointer's, and has latched already
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
            if (e.detail === 0) toggleLatched(toggle);
        },
        // The keyboard latches once per press, not on every repeat; the
        // default click it would make is the keydown's
        onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!e.repeat) toggleLatched(toggle);
            }
        },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
}

/** The drag mode menu's width (`w-280`), to keep it inside the field */
const DRAG_MODE_MENU_WIDTH = 280;

/** How long the layers over the field must stay put before the pill finds its spot again */
const PLACE_AFTER_LAYERS_MS = 120;

/** The field drawing and the marchers, in the field element's pixels */
function fieldLayout(marchers: FieldMarchers | null): {
    field: Rect | null;
    marchers: { x: number; y: number }[];
} {
    const view = useFieldViewStore.getState();
    if (view.width === 0 || view.field.width === 0)
        return { field: null, marchers: [] };
    const field: Rect = {
        left: view.panX,
        top: view.panY,
        width: view.field.width * view.zoom,
        height: view.field.height * view.zoom,
    };
    const points: { x: number; y: number }[] = [];
    if (marchers) {
        const { ids, positions, hidden } = marchers;
        for (let i = 0; i < ids.length; i++) {
            if (hidden[i]) continue;
            points.push(
                fieldToElement(view, positions[i * 2], positions[i * 2 + 1]),
            );
        }
    }
    return { field, marchers: points };
}

/**
 * One of the pill's segments: on is the accent on a light accent tint, as the shape editor's
 * toggles. Compact (the pill doesn't fit its pane): the icon over a short caption.
 */
const segment = (on: boolean, compact = false) =>
    clsx(
        "rounded-4 flex h-44 min-w-44 touch-none items-center justify-center whitespace-nowrap select-none",
        compact ? "text-sub flex-col gap-2 px-4 leading-none" : "gap-4 px-8",
        on ? "bg-accent/15 text-accent" : "hover:text-accent",
    );

/**
 * Whether the pill is too wide for the pane it floats in at full size (a 1024 px tablet with
 * the Inspector open): then it shows its compact form. The full width is measured while the
 * pill is full size, and again whenever the pane or what the pill says changes.
 */
function useCompactPill(
    enabled: boolean,
    pill: React.RefObject<HTMLElement | null>,
    pane: () => HTMLElement | null,
    content: unknown,
) {
    const [compact, setCompact] = useState(false);
    const fullWidth = useRef(0);
    useLayoutEffect(() => {
        if (!enabled) return;
        const measure = () => {
            const el = pill.current;
            const parent = pane();
            if (!el || !parent) return;
            if (!compact)
                fullWidth.current = Math.max(el.offsetWidth, el.scrollWidth);
            setCompact(parent.clientWidth - 2 * PILL_EDGE < fullWidth.current);
        };
        measure();
        const parent = pane();
        const observer =
            parent && typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(measure)
                : null;
        if (parent) observer?.observe(parent);
        return () => observer?.disconnect();
    }, [enabled, compact, pill, pane, content]);
    return compact;
}

/**
 * The floating pill over the field in the touch layout, where there is often no keyboard
 * (modifier roles, version A, "Touch and Apple Pencil"):
 * - Fine, Equal and From center: the held roles, as Shift, $mod and Alt are with a keyboard,
 * - Add and Subtract: a press adds to the selection, as Shift does, or a box or lasso takes out
 *   what it covers, as Alt does,
 * - "Drag" and the mode: what one finger or the pen does on empty field (Auto, Box, Lasso, Pan;
 *   `fieldDragMode.ts`), kept on this device,
 * - the magnet: the Snap toggle, pressed while snapping is off,
 * - "?" explains them. A long press on any of them explains it too.
 *
 * Each toggle is held while pressed, or latched by a tap. Drag the grip to move the pill; the
 * spot is remembered. Until then it sits at the bottom where it covers the fewest marchers, and
 * off the selection box, the open shape and their handles (#933). A spot the user chose gives way
 * to those handles too, and comes back once they've gone.
 */
// eslint-disable-next-line max-lines-per-function
export default function TouchModifierButtons({
    marchers = null,
    obstacles = null,
}: {
    /** The marchers drawn, for a spot that covers the fewest */
    marchers?: FieldMarchers | null;
    /** What's dragged on the field, which the pill keeps off (#933), in the field element's px */
    obstacles?: FieldObstacleSource | null;
}) {
    const { t } = useTranslate();
    const isTouchMode = useIsTouchMode();
    const held = useTouchModifierStore((s) => s.held);
    const latched = useTouchModifierStore((s) => s.latched);
    const clear = useTouchModifierStore((s) => s.clear);
    const snapOff = useUiSettingsStore((s) => !s.uiSettings.snap);
    // The magnet runs the toolbar's Toggle Snap action: same handler, enabled state and run listeners
    const snapRunnable = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled("toggleSnap"),
    );
    const [saved, setSaved] = useState<Position | null>(() =>
        parseModifierPosition(readStorage(TOUCH_MODIFIER_POSITION_KEY)),
    );
    const [auto, setAuto] = useState<Position | null>(null);
    /** The saved spot is under a task's bar or the toolbar panel: the automatic spot meanwhile */
    const [savedBlocked, setSavedBlocked] = useState(false);
    // Read by the placing, so a drag (which changes it on every move) doesn't set it up again
    const savedRef = useRef(saved);
    savedRef.current = saved;
    const dragMode = useFieldDragModeStore((s) => s.mode);
    const setDragMode = useFieldDragModeStore((s) => s.setMode);
    /** The help list or the drag mode menu, whichever is open */
    const [popup, setPopup] = useState<"help" | "dragMode" | null>(null);
    const [explained, setExplained] = useState<Explained | null>(null);
    const anchors = useRef<Partial<Record<Explained, HTMLElement | null>>>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    /** The field's obstacles the spot was last worked out for (`obstaclesKey`) */
    const placedFor = useRef("");
    const drag = useRef<{
        id: number;
        startX: number;
        startY: number;
        from: Position;
    } | null>(null);
    const presses = {
        fine: useTogglePress("fine", () => setExplained("fine")),
        constrain: useTogglePress("constrain", () => setExplained("constrain")),
        fromCenter: useTogglePress("fromCenter", () =>
            setExplained("fromCenter"),
        ),
        add: useTogglePress("add", () => setExplained("add")),
        subtract: useTogglePress("subtract", () => setExplained("subtract")),
    } satisfies Record<TouchToggle, unknown>;
    const dragModeLongPress = useLongPress(() => setExplained("dragMode"));
    const snapLongPress = useLongPress(() => setExplained("snap"));
    const helpLongPress = useLongPress(() => setExplained("help"));
    const gripLongPress = useLongPress(() => setExplained("grip"));
    const closeExplained = useCallback(() => setExplained(null), []);
    const position = saved && !savedBlocked ? saved : auto;

    // Moved: what keeps below it (a guide's name tag, #933) finds its place again
    const shownLeft = position?.left;
    const shownBottom = position?.bottom;
    useEffect(() => {
        if (shownLeft !== undefined) noteFieldLayersChanged();
    }, [shownLeft, shownBottom]);

    // Leaving touch mode (or the field) lets go of anything held or latched
    useEffect(() => {
        if (!isTouchMode) clear();
    }, [isTouchMode, clear]);
    useEffect(() => () => clear(), [clear]);

    const container = useCallback(
        () => (rootRef.current?.offsetParent as HTMLElement | null) ?? null,
        [],
    );
    const compact = useCompactPill(isTouchMode, pillRef, container, dragMode);

    const clamp = useCallback((p: Position): Position => {
        const pill = pillRef.current;
        const parent = rootRef.current?.offsetParent as HTMLElement | null;
        if (!pill || !parent) return p;
        const maxLeft = Math.max(0, parent.clientWidth - pill.offsetWidth);
        const maxBottom = Math.max(0, parent.clientHeight - pill.offsetHeight);
        return {
            left: Math.min(Math.max(0, p.left), maxLeft),
            bottom: Math.min(Math.max(0, p.bottom), maxBottom),
        };
    }, []);

    // No saved spot, or one under a task's bar: the bottom spot that covers the fewest marchers and
    // none of the other layers over the field (#927). Worked out again when the field area changes
    // size, when the view settles and when those layers change.
    const placeAutomatically = useCallback(() => {
        const pill = pillRef.current;
        const parent = rootRef.current?.offsetParent as HTMLElement | null;
        if (!pill || !parent) return;
        const { field, marchers: dots } = fieldLayout(marchers);
        const size = { width: pill.offsetWidth, height: pill.offsetHeight };
        const onField = obstacles?.read() ?? NO_FIELD_OBSTACLES;
        placedFor.current = obstaclesKey(onField);
        const next = choosePillPosition(
            { width: parent.clientWidth, height: parent.clientHeight },
            size,
            field,
            dots,
            fieldLayersIn(parent, PILL_AVOIDS, rootRef.current),
            onField,
        );
        setAuto((last) =>
            last?.left === next.left && last.bottom === next.bottom
                ? last
                : next,
        );
        // Not while it's being dragged: it would jump from under the finger
        if (drag.current) return;
        const saved = savedRef.current;
        setSavedBlocked(
            saved !== null &&
                [
                    ...fieldLayersIn(parent, SAVED_PILL_YIELDS_TO),
                    ...onField.handles,
                ].some((layer) =>
                    overlaps(
                        {
                            left: saved.left,
                            top:
                                parent.clientHeight -
                                saved.bottom -
                                size.height,
                            ...size,
                        },
                        layer,
                    ),
                ),
        );
    }, [marchers, obstacles]);
    useLayoutEffect(() => {
        if (!isTouchMode) return;
        placeAutomatically();
        // Again once the field has been fitted and the marchers drawn
        const later = setTimeout(placeAutomatically, 800);
        const parent = container();
        const observer =
            parent && typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => placeAutomatically())
                : null;
        if (parent) observer?.observe(parent);
        let settle: ReturnType<typeof setTimeout> | null = null;
        const offView = useFieldViewStore.subscribe(() => {
            if (settle !== null) clearTimeout(settle);
            settle = setTimeout(placeAutomatically, PLACE_AFTER_VIEW_MS);
        });
        let layersSettle: ReturnType<typeof setTimeout> | null = null;
        const offLayers = subscribeFieldLayers(() => {
            if (layersSettle !== null) clearTimeout(layersSettle);
            layersSettle = setTimeout(
                placeAutomatically,
                PLACE_AFTER_LAYERS_MS,
            );
        });
        // The selection box or the open shape changing (#933): placed again once it has settled
        // and no drag on the field is under way (the drag's end tells again)
        let obstaclesSettle: ReturnType<typeof setTimeout> | null = null;
        const offObstacles = obstacles?.subscribe(() => {
            if (obstaclesSettle !== null) clearTimeout(obstaclesSettle);
            obstaclesSettle = setTimeout(() => {
                obstaclesSettle = null;
                if (obstacles.busy()) return;
                if (obstaclesKey(obstacles.read()) === placedFor.current)
                    return;
                placeAutomatically();
            }, PLACE_AFTER_LAYERS_MS);
        });
        return () => {
            clearTimeout(later);
            if (settle !== null) clearTimeout(settle);
            if (layersSettle !== null) clearTimeout(layersSettle);
            if (obstaclesSettle !== null) clearTimeout(obstaclesSettle);
            observer?.disconnect();
            offView();
            offLayers();
            offObstacles?.();
        };
        // The compact form is narrower: a new spot for it
    }, [isTouchMode, placeAutomatically, compact, container, obstacles]);

    // The help closes on a press anywhere else (which does nothing more), or
    // Escape. Registered as it appears, so no press slips through.
    useLayoutEffect(() => {
        if (!popup && !explained) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            e.stopPropagation();
            e.preventDefault();
            swallowPress(e.pointerId);
            setPopup(null);
            setExplained(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPopup(null);
        };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [popup, explained]);

    const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerDown(e);
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety
        }
        drag.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            from: position ?? { left: PILL_EDGE, bottom: PILL_EDGE },
        };
        // Moved aside from its spot (#927): picked up from where it is, so it follows the finger
        // rather than staying put and jumping on release
        if (savedBlocked) {
            if (position) setSaved(position);
            setSavedBlocked(false);
        }
    };
    const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerMove(e);
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        setSaved(
            clamp({
                left: d.from.left + (e.clientX - d.startX),
                bottom: d.from.bottom - (e.clientY - d.startY),
            }),
        );
    };
    const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerUp(e);
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        drag.current = null;
        // Let go over a task's bar: it moves off it
        setTimeout(placeAutomatically, 0);
        setSaved((p) => {
            if (p) writeStorage(TOUCH_MODIFIER_POSITION_KEY, JSON.stringify(p));
            return p;
        });
    };

    if (!isTouchMode) return null;

    // The help and the menu open toward the middle of the field, on the side
    // with room, and scroll rather than run off the field
    const parent = container();
    const pillWidth = pillRef.current?.offsetWidth ?? 0;
    const pillHeight = pillRef.current?.offsetHeight ?? 48;
    const containerHeight = parent?.clientHeight ?? 0;
    const onRight =
        position && parent
            ? position.left + pillWidth / 2 > parent.clientWidth / 2
            : true;
    const roomAbove = position
        ? containerHeight - position.bottom - pillHeight - 16
        : 300;
    const roomBelow = position ? position.bottom - 16 : 0;
    const openBelow = roomAbove < 200 && roomBelow > roomAbove;
    const setAnchor = (key: Explained) => (el: HTMLElement | null) => {
        anchors.current[key] = el;
    };
    const popupStyle = {
        maxHeight: Math.max(120, openBelow ? roomBelow : roomAbove),
    };
    const popupVertical = clsx(
        "absolute overflow-y-auto",
        openBelow ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
    );
    const popupSide = clsx(popupVertical, onRight ? "right-0" : "left-0");
    // The drag mode menu opens over or under its own button (#933), lined up with its left edge,
    // and moved along only as far as it takes to stay inside the field
    const dragModeButton = anchors.current.dragMode;
    const dragModeMenuLeft =
        dragModeButton && parent && position
            ? Math.max(
                  PILL_EDGE - position.left,
                  Math.min(
                      dragModeButton.offsetLeft,
                      parent.clientWidth -
                          PILL_EDGE -
                          DRAG_MODE_MENU_WIDTH -
                          position.left,
                  ),
              )
            : 0;
    const current =
        DRAG_MODES.find((option) => option.mode === dragMode) ?? DRAG_MODES[0];
    const describe = (key: string) => t(key, { device: PEN_DEVICE });

    return (
        <div
            ref={rootRef}
            className="text-sub text-text pointer-events-auto absolute z-20"
            style={
                position
                    ? { left: position.left, bottom: position.bottom }
                    : {
                          right: PILL_EDGE,
                          bottom: PILL_EDGE,
                          visibility: "hidden",
                      }
            }
            // Presses on the pill are the pill's, not the field's navigation
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="touch-modifier-buttons"
            data-field-layer="pill"
        >
            {popup === "help" && (
                <div
                    role="note"
                    style={popupStyle}
                    className={clsx(
                        popupSide,
                        "rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal w-[240px] max-w-[calc(100vw-24px)] border p-12 leading-snug",
                    )}
                    onClick={() => setPopup(null)}
                >
                    <ul className="flex flex-col gap-4">
                        {HELP.map((key) => (
                            <li key={key}>
                                <T keyName={key} params={{ b: <b /> }} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {popup === "dragMode" && (
                <div
                    role="menu"
                    aria-label={t("touch.dragMode.menu")}
                    style={{ ...popupStyle, left: dragModeMenuLeft }}
                    className={clsx(
                        popupVertical,
                        MENU_CONTENT_CLASS,
                        "w-280 max-w-[calc(100vw-24px)]",
                    )}
                    data-testid="field-drag-mode-menu"
                >
                    <div className={MENU_LABEL_CLASS}>
                        {t("touch.dragMode.menu")}
                    </div>
                    {DRAG_MODES.map(({ mode, label, describe: text, Icon }) => (
                        <button
                            key={mode}
                            type="button"
                            role="menuitemradio"
                            aria-checked={mode === dragMode}
                            className={clsx(
                                MENU_BUTTON_CLASS,
                                "touch:min-h-44",
                                mode === dragMode && "bg-accent/15",
                            )}
                            data-testid={`field-drag-mode-${mode}`}
                            onClick={() => {
                                setDragMode(mode);
                                setPopup(null);
                            }}
                        >
                            <Icon size={18} className="shrink-0" />
                            <span className="flex flex-col">
                                <span className="font-medium">{t(label)}</span>
                                <span className="text-sub text-text-subtitle">
                                    {describe(text)}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <div
                ref={pillRef}
                // These explain themselves on a long press (not the app-wide guard)
                data-own-long-press
                data-compact={compact || undefined}
                className="rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal flex items-center gap-2 border p-2"
            >
                <div
                    ref={setAnchor("grip")}
                    role="button"
                    aria-label={t("touch.modifiers.grip")}
                    title={t("touch.modifiers.gripTitle")}
                    tabIndex={-1}
                    className="text-text/60 flex h-44 w-32 cursor-grab touch-none items-center justify-center"
                    onPointerDown={onGripDown}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <DotsSixVerticalIcon size={20} />
                </div>
                <button
                    ref={setAnchor("dragMode")}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={popup === "dragMode"}
                    aria-label={t("touch.dragMode.button", {
                        label: t(current.label),
                        describe: describe(current.describe),
                    })}
                    className={segment(popup === "dragMode", compact)}
                    data-testid="field-drag-mode"
                    {...dragModeLongPress}
                    onClick={() =>
                        setPopup((open) =>
                            open === "dragMode" ? null : "dragMode",
                        )
                    }
                >
                    {!compact && (
                        <span className="text-text-subtitle">
                            {t("touch.dragMode.prefix")}
                        </span>
                    )}
                    <current.Icon size={16} />
                    <span className="flex items-center gap-2">
                        {t(current.label)}
                        <CaretDownIcon size={compact ? 10 : 12} />
                    </span>
                </button>
                <span className="bg-stroke h-24 w-px" aria-hidden />
                {TOGGLES.map(({ toggle, label, hint, Icon }) => {
                    const isOn = held[toggle] || latched[toggle];
                    return (
                        <button
                            key={toggle}
                            ref={setAnchor(toggle)}
                            type="button"
                            // One name, the label shown; on or off is aria-pressed
                            aria-label={t(label)}
                            title={t(hint)}
                            aria-pressed={isOn}
                            className={segment(isOn, compact)}
                            data-testid={`touch-toggle-${toggle}`}
                            {...presses[toggle]}
                        >
                            <Icon
                                size={16}
                                weight={isOn ? "bold" : "regular"}
                            />
                            {t(label)}
                        </button>
                    );
                })}
                <span className="bg-stroke h-24 w-px" aria-hidden />
                <button
                    ref={setAnchor("snap")}
                    type="button"
                    aria-label={t("touch.modifiers.noSnap")}
                    title={t(EXPLAIN.snap)}
                    aria-pressed={snapOff}
                    disabled={!snapRunnable}
                    className={clsx(
                        segment(snapOff, compact),
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                    data-testid="touch-snap"
                    {...snapLongPress}
                    onClick={() => runAction("toggleSnap")}
                >
                    <MagnetIcon
                        size={16}
                        weight={snapOff ? "bold" : "regular"}
                    />
                    {t("touch.modifiers.noSnap")}
                </button>
                <button
                    ref={setAnchor("help")}
                    type="button"
                    aria-label={t("touch.modifiers.help")}
                    aria-expanded={popup === "help"}
                    className="rounded-4 text-text/60 hover:text-accent flex h-44 w-44 items-center justify-center"
                    {...helpLongPress}
                    onClick={() =>
                        setPopup((open) => (open === "help" ? null : "help"))
                    }
                >
                    <QuestionIcon size={20} />
                </button>
            </div>
            <LongPressBubble
                anchor={explained ? (anchors.current[explained] ?? null) : null}
                open={explained !== null}
                onClose={closeExplained}
            >
                {explained ? t(EXPLAIN[explained]) : ""}
            </LongPressBubble>
        </div>
    );
}
