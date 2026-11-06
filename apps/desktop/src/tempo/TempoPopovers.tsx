// cspell:ignore priya
/**
 * Tempo mode: the tempo lanes' popovers: the add/remove box,
 * the inline editor, and the right-click menu with its icons.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
    ArrowLineRightIcon,
    ArrowsInLineHorizontalIcon,
    CaretRightIcon,
    PauseIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import tolgee from "@/global/singletons/Tolgee";
import { useOnScreen } from "./bandLayout";
import { CountAsk, CountRange, Editor, Menu } from "./tempoBandTypes";
import { CountAnswer, useTempoUi } from "./tempoUi";
import {
    MENU_BUTTON_CLASS,
    MENU_CONTENT_CLASS,
    MENU_SEPARATOR_CLASS,
    POPOVER_CLASS,
} from "@/components/ui/popupClasses";

/**
 * The popovers are portals, so React hands their events on to the band they open from: stopped
 * here, a right-click in one doesn't open the band's menu and a pointer over one doesn't
 * hit-test the lanes under it. A right-click still gets its own menu (paste in a field).
 */
const keepEventsIn = {
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerMove: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerUp: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onContextMenu: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

export function CountAskPopover({
    ask,
    onClose,
}: {
    ask: CountAsk;
    onClose: () => void;
}) {
    const ui = useTempoUi();
    const keepOk = !!ask.keep;
    const holdOk = !!ask.hold && "run" in ask.hold;
    // The last answer when it's on offer here. With none yet, a spot where a page or a move ends
    // starts on holding the drill (a breath before a new page is the usual reason to add a count
    // there); anywhere else on keeping everything else in place
    const remembered = ui.choice;
    const preferred: CountAnswer =
        remembered === "hold" && holdOk
            ? "hold"
            : remembered === "keep" && keepOk
              ? "keep"
              : remembered === "shift"
                ? "shift"
                : remembered === null && ask.boundary && holdOk
                  ? "hold"
                  : keepOk
                    ? "keep"
                    : "shift";
    const choose = (choice: CountAnswer) => {
        if (choice === "hold") {
            if (!ask.hold || !("run" in ask.hold)) return;
            ui.setChoice("hold");
            onClose();
            ask.hold.run();
            return;
        }
        if (choice === "keep" && !ask.keep) return;
        ui.setChoice(choice);
        onClose();
        if (choice === "keep" && ask.keep) ask.keep.run();
        else ask.shift.run();
    };
    // The picked card is the one Enter takes: it starts on the preferred answer and follows the
    // keyboard focus, never the pointer (marcus, priya: a hovered card looked picked too)
    const [picked, setPicked] = useState<CountAnswer>(preferred);
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => ref.current?.focus(), []);
    const boxRef = useRef<HTMLDivElement>(null);
    const position = useOnScreen(boxRef, ask.x, ask.y, "above", ask);
    // Esc cancels wherever the focus is, and only cancels (tempo mode stays on); so does a press
    // outside the box (one inside stops before it reaches the window)
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            close.current();
        };
        const onOutside = () => close.current();
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("pointerdown", onOutside);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("pointerdown", onOutside);
        };
    }, []);
    // Each choice is an action, done on click (owner, 2026-11-01: they read as radios). The one
    // Enter takes shows the key instead of a radio dot
    const icons: Record<CountAnswer, ReactNode> = {
        keep: <ArrowsInLineHorizontalIcon size={14} aria-hidden />,
        shift: <ArrowLineRightIcon size={14} aria-hidden />,
        hold: <PauseIcon size={14} aria-hidden />,
    };
    const option = (
        choice: CountAnswer,
        title: string,
        text: string,
        disabled?: string,
    ) => (
        <button
            ref={choice === preferred ? ref : undefined}
            type="button"
            disabled={!!disabled}
            data-picked={choice === picked ? "true" : undefined}
            className={clsx(
                "rounded-6 group flex cursor-pointer items-start gap-8 border p-8 text-left outline-hidden disabled:cursor-default disabled:opacity-50",
                choice === picked
                    ? "border-accent bg-accent/10"
                    : "border-stroke hover:border-accent/60 hover:bg-fg-2",
            )}
            onFocus={() => setPicked(choice)}
            onClick={() => choose(choice)}
        >
            <span
                className={clsx(
                    "mt-1 shrink-0",
                    choice === picked ? "text-accent" : "text-text-subtitle",
                )}
            >
                {icons[choice]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-bold">{title}</span>
                <span className="text-text-subtitle text-sub">{text}</span>
            </span>
            <span className="mt-1 shrink-0 self-center">
                {choice === picked ? (
                    <Shortcut binding="Enter" />
                ) : (
                    <CaretRightIcon
                        size={12}
                        className="text-text-subtitle opacity-0 group-hover:opacity-100"
                        aria-hidden
                    />
                )}
            </span>
        </button>
    );
    return (
        <div
            ref={boxRef}
            data-testid="tempo-count-ask"
            role="dialog"
            aria-label={ask.title}
            className={`${POPOVER_CLASS} fixed z-[100] flex max-h-[calc(100vh-16px)] w-380 max-w-[calc(100vw-16px)] flex-col gap-8 overflow-y-auto`}
            style={position}
            {...keepEventsIn}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") onClose();
            }}
        >
            <div className="text-body font-bold">{ask.title}</div>
            {ask.blocked ? (
                <BlockedAsk blocked={ask.blocked} onClose={onClose} />
            ) : (
                <>
                    <div className="text-text-subtitle text-sub">
                        {ask.intro}
                    </div>
                    {ask.warning && (
                        <div
                            data-testid="tempo-count-ask-warning"
                            className="text-red text-sub flex items-start gap-6"
                        >
                            <WarningIcon
                                size={13}
                                className="mt-px shrink-0"
                                aria-hidden
                            />
                            <span>{ask.warning}</span>
                        </div>
                    )}
                    {ask.keep &&
                        option(
                            "keep",
                            tolgee.t(
                                "tempoMode.popovers.countAsk.keep",
                                "Keep everything else in place",
                            ),
                            ask.keep.text,
                        )}
                    {option(
                        "shift",
                        tolgee.t(
                            "tempoMode.popovers.countAsk.shift",
                            "Shift everything after",
                        ),
                        ask.shift.text,
                    )}
                    {ask.hold && (
                        <>
                            <div className="text-text-subtitle text-sub pt-2">
                                {tolgee.t(
                                    "tempoMode.popovers.countAsk.holdIntro",
                                    "The music has no extra beat, but the marchers need a breath here?",
                                )}
                            </div>
                            {option(
                                "hold",
                                tolgee.t(
                                    "tempoMode.popovers.countAsk.hold",
                                    "Hold the drill here instead",
                                ),
                                ask.hold.text,
                                "disabled" in ask.hold
                                    ? ask.hold.disabled
                                    : undefined,
                            )}
                        </>
                    )}
                    <div className="text-text-subtitle text-sub">
                        <T
                            keyName="tempoMode.popovers.countAsk.footer"
                            defaultValue="Click one to do it. <enter></enter> does the one marked, your last choice; <escape></escape> cancels, and Undo takes any of them back."
                            params={{
                                enter: () => <Shortcut binding="Enter" />,
                                escape: () => <Shortcut binding="Escape" />,
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * The remove box when the removal would hide a set: what would go wrong, then the ways out as
 * buttons (end the keyframe a count earlier and remove; remove fewer counts; cancel)
 */
function BlockedAsk({
    blocked,
    onClose,
}: {
    blocked: NonNullable<CountAsk["blocked"]>;
    onClose: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => ref.current?.focus(), []);
    const fixOk = "run" in blocked.fix;
    const fewer = blocked.fewer;
    const fewerOk = !!fewer && "run" in fewer;
    const action = (
        label: string,
        hint: string,
        run: (() => void) | undefined,
        disabled: string | undefined,
        primary: boolean,
        testId: string,
    ) => (
        <button
            ref={primary && run ? ref : undefined}
            type="button"
            data-testid={testId}
            disabled={!run}
            className={clsx(
                "rounded-6 flex flex-col items-start border p-8 text-left outline-hidden disabled:cursor-default disabled:opacity-50",
                primary
                    ? "border-accent bg-accent/10 hover:bg-accent/20 focus-visible:ring-accent focus-visible:ring-1"
                    : "border-stroke hover:border-accent/60 hover:bg-fg-2 focus-visible:border-accent",
            )}
            onClick={() => {
                if (!run) return;
                onClose();
                run();
            }}
        >
            <span className="text-body font-bold">{label}</span>
            <span className="text-text-subtitle text-sub">
                {disabled ?? hint}
            </span>
        </button>
    );
    return (
        <>
            <div
                data-testid="tempo-count-ask-blocked"
                className="text-sub flex items-start gap-6"
            >
                <WarningIcon
                    size={14}
                    weight="fill"
                    className="text-red mt-px shrink-0"
                    aria-hidden
                />
                <span className="flex flex-col gap-2">
                    <span className="font-bold">{blocked.title}</span>
                    <span className="text-text-subtitle">{blocked.text}</span>
                </span>
            </div>
            {action(
                tolgee.t(
                    "tempoMode.popovers.countAsk.blocked.fix",
                    "End the keyframe a count earlier, then remove",
                ),
                blocked.fix.text,
                fixOk ? (blocked.fix as { run: () => void }).run : undefined,
                "disabled" in blocked.fix ? blocked.fix.disabled : undefined,
                true,
                "tempo-count-ask-fix",
            )}
            {fewer &&
                action(
                    fewer.label,
                    fewer.text,
                    fewerOk ? (fewer as { run: () => void }).run : undefined,
                    "disabled" in fewer ? fewer.disabled : undefined,
                    !fixOk,
                    "tempo-count-ask-fewer",
                )}
            <button
                type="button"
                className="text-text-subtitle hover:text-text text-sub self-end px-4"
                onClick={onClose}
            >
                {tolgee.t(
                    "tempoMode.popovers.countAsk.blocked.cancel",
                    "Cancel",
                )}
            </button>
        </>
    );
}

export function InlineEditor({
    editor,
    onClose,
}: {
    editor: Editor;
    onClose: () => void;
}) {
    const [value, setValue] = useState(editor.value);
    const ref = useRef<HTMLInputElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const position = useOnScreen(boxRef, editor.x, editor.y, "above", editor);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);
    return (
        <div
            ref={boxRef}
            className={`${POPOVER_CLASS} fixed z-[100] flex max-w-280 flex-col gap-8 p-8`}
            style={position}
            {...keepEventsIn}
        >
            <span className="text-text-subtitle text-sub">{editor.hint}</span>
            <input
                ref={ref}
                data-testid="tempo-editor-input"
                className="rounded-6 border-stroke bg-fg-2 text-body text-text focus:border-accent h-26 border px-8 outline-hidden"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                        editor.onCommit(value);
                        onClose();
                    } else if (e.key === "Escape") onClose();
                }}
                onBlur={onClose}
            />
            {editor.extra && (
                <button
                    type="button"
                    data-testid="tempo-editor-extra"
                    className="text-accent text-sub self-start text-left hover:underline"
                    // keeps the focus in the field, so its blur doesn't close the box first
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        onClose();
                        editor.extra!.onSelect();
                    }}
                >
                    {editor.extra.label}
                </button>
            )}
        </div>
    );
}

/** A time signature as a menu icon: 3 over 4 (owner, 2026-11-01) */
export function MeterGlyph({ top, bottom }: { top: string; bottom: string }) {
    return (
        <span
            // eslint-disable-next-line no-restricted-syntax -- a picture drawn in text, sized to the 16 px icon slot
            className="flex flex-col items-center text-[8px] leading-[7px] font-bold"
            aria-hidden
        >
            <span>{top}</span>
            <span>{bottom}</span>
        </span>
    );
}

/** A rehearsal mark as a menu icon: its letter in a box */
export function MarkGlyph({ letter }: { letter: string }) {
    return (
        <span
            // eslint-disable-next-line no-restricted-syntax -- a picture drawn in text, sized to the 16 px icon slot
            className="flex h-[13px] min-w-[13px] items-center justify-center rounded-[2px] border border-current px-[1px] text-[8px] leading-none font-bold"
            aria-hidden
        >
            {letter}
        </span>
    );
}

/** A measure number as a menu icon: "m34" */
export function NumberGlyph({ n }: { n: number }) {
    return (
        <span
            // eslint-disable-next-line no-restricted-syntax -- a picture drawn in text, sized to the 16 px icon slot
            className="text-[9px] leading-none font-bold"
            aria-hidden
        >
            {tolgee.t("tempoMode.popovers.measureGlyph", "m{number}", {
                number: String(n),
            })}
        </span>
    );
}

/** A fermata as a menu icon: an arc over a dot (fonts often lack 𝄐) */
export function FermataGlyph() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden
        >
            <path d="M2 11a6 6 0 0 1 12 0" />
            <circle cx="8" cy="10" r="1.3" fill="currentColor" />
        </svg>
    );
}

/** A tempo change as a menu icon: a step with its dot */
export function StepGlyph() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M2 11h5V5h7" />
            <circle cx="7" cy="5" r="1.6" fill="currentColor" />
        </svg>
    );
}

export function ContextMenu({
    menu,
    onClose,
    onHover,
}: {
    menu: Menu;
    onClose: () => void;
    /** The counts the item under the pointer (or focus) would change, or null */
    onHover: (range: CountRange | null) => void;
}) {
    useEffect(() => {
        const close = () => onClose();
        // Esc closes the menu, and only the menu (not tempo mode)
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("blur", close);
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("blur", close);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [onClose]);
    const ref = useRef<HTMLDivElement>(null);
    const position = useOnScreen(ref, menu.x, menu.y, "below", menu);
    return (
        <div
            ref={ref}
            data-testid="tempo-menu"
            className={`${MENU_CONTENT_CLASS} fixed z-[100] max-h-[calc(100vh-16px)] w-max max-w-[min(440px,calc(100vw-16px))] min-w-220 overflow-y-auto`}
            style={position}
            {...keepEventsIn}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onPointerLeave={() => onHover(null)}
        >
            {menu.title && (
                <div className="text-body flex items-baseline justify-between gap-12 px-8 py-4 font-medium">
                    <span>{menu.title}</span>
                    {menu.subtitle && (
                        <span className="text-text-subtitle text-sub">
                            {menu.subtitle}
                        </span>
                    )}
                </div>
            )}
            {menu.title && <div className={MENU_SEPARATOR_CLASS} aria-hidden />}
            {menu.items.map((item) => (
                <Fragment key={item.label}>
                    {item.separatorBefore && (
                        <div className={MENU_SEPARATOR_CLASS} aria-hidden />
                    )}
                    <button
                        type="button"
                        disabled={item.disabled}
                        title={item.hint}
                        className={MENU_BUTTON_CLASS}
                        onPointerEnter={() => onHover(item.range ?? null)}
                        onFocus={() => onHover(item.range ?? null)}
                        onClick={() => {
                            onClose();
                            item.onSelect();
                        }}
                    >
                        <span className="text-text-subtitle flex w-[16px] shrink-0 items-center justify-center">
                            {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {item.aside && (
                            <span className="text-text-subtitle text-sub">
                                {item.aside}
                            </span>
                        )}
                    </button>
                </Fragment>
            ))}
        </div>
    );
}
