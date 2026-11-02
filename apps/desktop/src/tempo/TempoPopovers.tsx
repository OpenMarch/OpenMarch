// cspell:ignore priya
/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): the tempo lanes' popovers: the add/remove box,
 * the inline editor, and the right-click menu with its icons.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
    ArrowLineRightIcon,
    ArrowsInLineHorizontalIcon,
    CaretRightIcon,
    PauseIcon,
} from "@phosphor-icons/react";
import { Keycaps } from "@/components/timeline/ShortcutTooltip";
import { useOnScreen } from "./bandLayout";
import { CountAsk, CountRange, Editor, Menu } from "./tempoBandTypes";
import { CountAnswer, useTempoUi } from "./tempoUi";

export function CountAskPopover({
    ask,
    onClose,
}: {
    ask: CountAsk;
    onClose: () => void;
}) {
    const ui = useTempoUi();
    const keepOk = "run" in ask.keep;
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
        if (choice === "keep" && !("run" in ask.keep)) return;
        ui.setChoice(choice);
        onClose();
        if (choice === "keep" && "run" in ask.keep) ask.keep.run();
        else ask.shift.run();
    };
    // The picked card is the one Enter takes: it starts on the preferred answer and follows the
    // keyboard focus, never the pointer (marcus, priya: a hovered card looked picked too)
    const [picked, setPicked] = useState<CountAnswer>(preferred);
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => ref.current?.focus(), []);
    const boxRef = useRef<HTMLDivElement>(null);
    const position = useOnScreen(boxRef, ask.x, ask.y, "above", ask);
    // Esc cancels wherever the focus is, and only cancels (tempo mode stays on)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);
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
                <span className="text-[12px] font-bold">{title}</span>
                <span className="text-text-subtitle text-[11px]">{text}</span>
            </span>
            <span className="mt-1 shrink-0 self-center">
                {choice === picked ? (
                    <Keycaps shortcut="Enter" />
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
            className="bg-modal shadow-modal text-text border-stroke rounded-6 fixed z-[100] flex max-h-[calc(100vh-16px)] w-[380px] max-w-[calc(100vw-16px)] flex-col gap-6 overflow-y-auto border p-8 shadow-lg backdrop-blur-md"
            style={position}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") onClose();
            }}
        >
            <div className="text-[12px] font-bold">{ask.title}</div>
            <div className="text-text-subtitle text-[11px]">{ask.intro}</div>
            {option(
                "keep",
                "Keep everything else in place",
                ask.keep.text,
                "disabled" in ask.keep ? ask.keep.disabled : undefined,
            )}
            {option("shift", "Shift everything after", ask.shift.text)}
            {ask.hold && (
                <>
                    <div className="text-text-subtitle pt-2 text-[11px]">
                        The music has no extra beat, but the marchers need a
                        breath here?
                    </div>
                    {option(
                        "hold",
                        "Hold the drill here instead",
                        ask.hold.text,
                        "disabled" in ask.hold ? ask.hold.disabled : undefined,
                    )}
                </>
            )}
            <div className="text-text-subtitle text-[10px]">
                Click one to do it. Enter does the one marked, your last choice;
                Esc cancels, and Undo takes any of them back.
            </div>
        </div>
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
            className="bg-modal shadow-modal text-text border-stroke rounded-6 fixed z-[100] flex max-w-[280px] flex-col gap-4 border p-6 shadow-lg backdrop-blur-md"
            style={position}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <span className="text-text-subtitle text-[11px]">
                {editor.hint}
            </span>
            <input
                ref={ref}
                data-testid="tempo-editor-input"
                className="border-stroke bg-fg-1 rounded-4 border px-6 py-2 text-[13px]"
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
                    className="text-accent self-start text-left text-[11px] hover:underline"
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
        <span className="text-[9px] leading-none font-bold" aria-hidden>
            m{n}
        </span>
    );
}

/** Text as a menu icon: ×2 */
export function TextGlyph({ children }: { children: ReactNode }) {
    return (
        <span className="text-[11px] leading-none font-bold" aria-hidden>
            {children}
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
            className="bg-modal shadow-modal text-text border-stroke rounded-6 fixed z-[100] flex max-h-[calc(100vh-16px)] w-max max-w-[min(440px,calc(100vw-16px))] min-w-[220px] flex-col overflow-y-auto border py-4 shadow-lg backdrop-blur-md"
            style={position}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            onPointerLeave={() => onHover(null)}
        >
            {menu.title && (
                <div className="border-stroke mb-2 flex items-baseline justify-between gap-12 border-b px-10 py-4 text-[12px] font-bold">
                    <span>{menu.title}</span>
                    {menu.subtitle && (
                        <span className="text-text-subtitle font-medium">
                            {menu.subtitle}
                        </span>
                    )}
                </div>
            )}
            {menu.items.map((item) => (
                <Fragment key={item.label}>
                    {item.separatorBefore && (
                        <div className="bg-stroke mx-0 my-3 h-px" aria-hidden />
                    )}
                    <button
                        type="button"
                        disabled={item.disabled}
                        title={item.hint}
                        className="hover:bg-fg-2 text-text flex items-center gap-8 px-10 py-3 text-left text-[12px] disabled:opacity-40"
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
                            <span className="text-text-subtitle text-[11px]">
                                {item.aside}
                            </span>
                        )}
                    </button>
                </Fragment>
            ))}
        </div>
    );
}
