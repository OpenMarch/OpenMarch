import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import {
    ArrowsOutIcon,
    CrosshairSimpleIcon,
    DotsSixVerticalIcon,
    EqualsIcon,
    MagnetIcon,
    PlusCircleIcon,
    QuestionIcon,
    type Icon,
} from "@phosphor-icons/react";
import { LongPressBubble, useLongPress } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import type { FieldMarchers } from "@/field/three/fieldMarchers";
import { fieldToElement, useFieldViewStore } from "@/field/three/fieldView";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    useTouchModifierStore,
    type TouchToggle,
} from "@/stores/TouchModifierStore";
import { choosePillPosition, PILL_EDGE, type Rect } from "./pillPlacement";
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

/** The pill's toggles, in order: the held roles, then Add. Named by role, never by key. */
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
];

const EXPLAIN = {
    grip: "touch.modifiers.explain.grip",
    fine: "touch.modifiers.explain.fine",
    constrain: "touch.modifiers.explain.constrain",
    fromCenter: "touch.modifiers.explain.fromCenter",
    add: "touch.modifiers.explain.add",
    snap: "touch.modifiers.explain.snap",
    help: "touch.modifiers.explain.help",
} as const satisfies Record<TouchToggle | "grip" | "snap" | "help", string>;
type Explained = keyof typeof EXPLAIN;

const HELP = [
    "touch.modifiers.helpList.toggles",
    "touch.modifiers.helpList.fine",
    "touch.modifiers.helpList.fromCenter",
    "touch.modifiers.helpList.add",
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

/** One of the pill's segments: on is the accent on a light accent tint, as the shape editor's toggles */
const segment = (on: boolean) =>
    clsx(
        "rounded-4 flex h-44 min-w-44 touch-none items-center justify-center gap-4 px-8 whitespace-nowrap select-none",
        on ? "bg-accent/15 text-accent" : "hover:text-accent",
    );

/**
 * The floating pill over the field in the touch layout, where there is often no keyboard
 * (modifier roles, version A, "Touch and Apple Pencil"):
 * - Fine, Equal and From center: the held roles, as Shift, $mod and Alt are with a keyboard,
 * - Add: adds to the selection, as Shift at the press,
 * - the magnet: the Snap toggle, pressed while snapping is off,
 * - "?" explains them. A long press on any of them explains it too.
 *
 * Each toggle is held while pressed, or latched by a tap. Drag the grip to move the pill; the
 * spot is remembered. Until then it sits at the bottom where it covers the fewest marchers.
 */
// eslint-disable-next-line max-lines-per-function
export default function TouchModifierButtons({
    marchers = null,
}: {
    /** The marchers drawn, for a spot that covers the fewest */
    marchers?: FieldMarchers | null;
}) {
    const { t } = useTolgee();
    const isTouchMode = useIsTouchMode();
    const held = useTouchModifierStore((s) => s.held);
    const latched = useTouchModifierStore((s) => s.latched);
    const clear = useTouchModifierStore((s) => s.clear);
    const snapOff = useUiSettingsStore((s) => !s.uiSettings.snap);
    const setSnap = useUiSettingsStore((s) => s.setSnap);
    const [saved, setSaved] = useState<Position | null>(() =>
        parseModifierPosition(readStorage(TOUCH_MODIFIER_POSITION_KEY)),
    );
    const [auto, setAuto] = useState<Position | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [explained, setExplained] = useState<Explained | null>(null);
    const anchors = useRef<Partial<Record<Explained, HTMLElement | null>>>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
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
    } satisfies Record<TouchToggle, unknown>;
    const snapLongPress = useLongPress(() => setExplained("snap"));
    const helpLongPress = useLongPress(() => setExplained("help"));
    const gripLongPress = useLongPress(() => setExplained("grip"));
    const closeExplained = useCallback(() => setExplained(null), []);
    const position = saved ?? auto;

    // Leaving touch mode (or the field) lets go of anything held or latched
    useEffect(() => {
        if (!isTouchMode) clear();
    }, [isTouchMode, clear]);
    useEffect(() => () => clear(), [clear]);

    const container = () =>
        (rootRef.current?.offsetParent as HTMLElement | null) ?? null;

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

    // No saved spot: the bottom spot that covers the fewest marchers. Worked
    // out again when the field area changes size and when the view settles.
    const placeAutomatically = useCallback(() => {
        const pill = pillRef.current;
        const parent = rootRef.current?.offsetParent as HTMLElement | null;
        if (!pill || !parent) return;
        const { field, marchers: dots } = fieldLayout(marchers);
        setAuto(
            choosePillPosition(
                { width: parent.clientWidth, height: parent.clientHeight },
                { width: pill.offsetWidth, height: pill.offsetHeight },
                field,
                dots,
            ),
        );
    }, [marchers]);
    useLayoutEffect(() => {
        if (!isTouchMode || saved) return;
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
        return () => {
            clearTimeout(later);
            if (settle !== null) clearTimeout(settle);
            observer?.disconnect();
            offView();
        };
    }, [isTouchMode, saved, placeAutomatically]);

    // The help closes on a press anywhere else (which does nothing more), or
    // Escape. Registered as it appears, so no press slips through.
    useLayoutEffect(() => {
        if (!helpOpen && !explained) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            e.stopPropagation();
            e.preventDefault();
            swallowPress(e.pointerId);
            setHelpOpen(false);
            setExplained(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setHelpOpen(false);
        };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [helpOpen, explained]);

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
        setSaved((p) => {
            if (p) writeStorage(TOUCH_MODIFIER_POSITION_KEY, JSON.stringify(p));
            return p;
        });
    };

    if (!isTouchMode) return null;

    // The help opens toward the middle of the field, on the side with room,
    // and scrolls rather than run off the field
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
        >
            {helpOpen && (
                <div
                    role="note"
                    style={{
                        maxHeight: Math.max(
                            120,
                            openBelow ? roomBelow : roomAbove,
                        ),
                    }}
                    className={clsx(
                        "rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal absolute w-[240px] max-w-[calc(100vw-24px)] overflow-y-auto border p-12 leading-snug",
                        onRight ? "right-0" : "left-0",
                        openBelow
                            ? "top-[calc(100%+8px)]"
                            : "bottom-[calc(100%+8px)]",
                    )}
                    onClick={() => setHelpOpen(false)}
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
            <div
                ref={pillRef}
                // These explain themselves on a long press (not the app-wide guard)
                data-own-long-press
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
                            className={segment(isOn)}
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
                    className={segment(snapOff)}
                    data-testid="touch-snap"
                    {...snapLongPress}
                    onClick={() => setSnap()}
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
                    aria-expanded={helpOpen}
                    className="rounded-4 text-text/60 hover:text-accent flex h-44 w-44 items-center justify-center"
                    {...helpLongPress}
                    onClick={() => setHelpOpen((open) => !open)}
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
