import { forwardRef, useRef, type ComponentProps, type ReactNode } from "react";
import { Input, Switch } from "@openmarch/ui";
import clsx from "clsx";
import { useDraft } from "../useDraft";

/**
 * The Field panel's inputs (#824), one row each like the Metronome panel's: the label on the left,
 * the field on the right, in one column (`CONTROL`) so every row's box starts and ends in the same
 * place. Numbers sit right, words left; a unit sits inside the box. A long text (`stacked`) puts its
 * label above a box the panel's width. Text saves on blur or Enter, only when the value is valid and different;
 * an invalid value goes back to the stored one. They follow the stored value, so after an undo
 * they show what the field has (B1).
 */
export function CommitInput<T>({
    label,
    stored,
    current,
    parse,
    onCommit,
    unit,
    hint,
    testId,
    numeric,
    placeholder,
    title,
    stacked,
    readout,
    afterEnter,
}: {
    label: string;
    /** The stored value as the input shows it */
    stored: string;
    /** The stored value itself: typing it again saves nothing */
    current: T;
    /** What the text means, or null when it isn't valid */
    parse: (text: string) => { value: T } | null;
    onCommit: (value: T) => void;
    unit?: string;
    /** An explanation, under the label */
    hint?: ReactNode;
    testId?: string;
    numeric?: boolean;
    placeholder?: string;
    title?: string;
    /** A long text (a field's name): the label above, the box the panel's width */
    stacked?: boolean;
    /** What the value works out to ("8 to 5"), under the box */
    readout?: ReactNode;
    /** After Enter has saved it: where the keyboard goes next (the Line section's field) */
    afterEnter?: () => void;
}) {
    const [draft, setDraft] = useDraft(stored);
    const parsed = parse(draft);
    // Escape drops the typing: the blur that follows must not save it (roast)
    const cancelled = useRef(false);
    const commit = () => {
        if (cancelled.current) {
            cancelled.current = false;
            setDraft(stored);
            return;
        }
        if (parsed === null || Object.is(parsed.value, current)) {
            setDraft(stored);
            return;
        }
        onCommit(parsed.value);
    };
    const box = (
        <SettingBox
            unit={unit}
            invalid={parsed === null}
            numeric={numeric}
            value={draft}
            placeholder={placeholder}
            data-testid={testId}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    // The field's: it doesn't also reach the app's Enter
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.blur();
                    afterEnter?.();
                }
                if (e.key === "Escape") {
                    // The field's, not the panel's: it doesn't also step back
                    e.preventDefault();
                    e.stopPropagation();
                    cancelled.current = true;
                    setDraft(stored);
                    e.currentTarget.blur();
                }
            }}
        />
    );
    if (stacked)
        return (
            <label
                className="text-body text-text/80 flex min-w-0 flex-col gap-4 px-12"
                title={title}
            >
                <span>{label}</span>
                {box}
                {hint && <span className={HINT}>{hint}</span>}
            </label>
        );
    return (
        <label className="flex min-w-0 flex-col gap-2" title={title}>
            <span className={ROW}>
                <span className="min-w-0">{label}</span>
                <span className={CONTROL}>{box}</span>
            </span>
            {readout && <Readout>{readout}</Readout>}
            {hint && <Hint>{hint}</Hint>}
        </label>
    );
}

/** The panel's one control column: every short box, select and value starts and ends here */
export const CONTROL = "flex w-160 shrink-0 items-center justify-end";

/**
 * A text box filling its column. A number sits right; a unit sits inside the box, after it, so
 * boxes with and without one line up.
 */
export const SettingBox = forwardRef<
    HTMLInputElement,
    Omit<ComponentProps<typeof Input>, "ref"> & {
        unit?: string;
        invalid?: boolean;
        numeric?: boolean;
    }
>(function SettingBox(
    { unit, invalid, numeric, className, inputMode, ...props },
    ref,
) {
    const align = numeric && "text-right tabular-nums";
    const input = (
        <Input
            ref={ref}
            compact
            aria-invalid={invalid}
            inputMode={inputMode ?? (numeric ? "decimal" : undefined)}
            className={clsx(
                "w-full min-w-0",
                align,
                unit && "h-full border-none bg-none px-0 py-0",
                !unit && invalid && "border-red",
                className,
            )}
            {...props}
        />
    );
    if (!unit) return input;
    return (
        <span
            className={clsx(
                "rounded-6 border-stroke bg-fg-2 focus-within:border-accent touch:h-44 flex h-26 w-full items-center gap-4 border px-8",
                invalid && "border-red",
            )}
        >
            {input}
            <span className="text-sub text-text-subtitle shrink-0 select-none">
                {unit}
            </span>
        </span>
    );
});

const HINT = "text-sub text-text-subtitle";

/** What a row's value works out to, right under its box */
export function Readout({ children }: { children: ReactNode }) {
    return (
        <span className={`${HINT} self-end px-12 text-right tabular-nums`}>
            {children}
        </span>
    );
}

/** A number ≥ `min` (or > `min` with `exclusive`); "" is `empty` when given */
export function parseNumber(
    text: string,
    {
        min = -Infinity,
        exclusive = false,
        empty,
    }: { min?: number; exclusive?: boolean; empty?: number } = {},
): { value: number } | null {
    const trimmed = text.trim();
    if (trimmed === "") return empty === undefined ? null : { value: empty };
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(trimmed)) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return null;
    if (exclusive ? value <= min : value < min) return null;
    return { value };
}

export function SwitchRow({
    label,
    checked,
    onChange,
    testId,
    children,
}: {
    label: string;
    checked: boolean;
    onChange: (on: boolean) => void;
    testId?: string;
    children?: ReactNode;
}) {
    return (
        <label className={ROW}>
            <span className="flex items-center gap-6">
                {label}
                {children}
            </span>
            <Switch
                checked={checked}
                onCheckedChange={onChange}
                data-testid={testId}
            />
        </label>
    );
}

/** A setting's row, as in the Metronome panel: label left, control right */
export const ROW =
    "text-body text-text/80 flex min-h-26 w-full items-center justify-between gap-12 px-12";

/**
 * A row holding any control (a select, a slider, a value): in the control column, which a longer
 * value may widen to the left
 */
export function Row({
    label,
    children,
    title,
    stacked,
}: {
    label: ReactNode;
    children: ReactNode;
    title?: string;
    /** A long value (a template's name): the label above, the control the panel's width */
    stacked?: boolean;
}) {
    if (stacked)
        return (
            <div
                className="text-body text-text/80 flex min-w-0 flex-col gap-4 px-12"
                title={title}
            >
                <span>{label}</span>
                {children}
            </div>
        );
    return (
        <div className={ROW} title={title}>
            <span className="min-w-0">{label}</span>
            <span className={clsx(CONTROL, "w-auto min-w-160 gap-6")}>
                {children}
            </span>
        </div>
    );
}

/** A note under a row's label */
export function Hint({ children }: { children: ReactNode }) {
    return <span className={`${HINT} px-12`}>{children}</span>;
}

/** A group inside a tab: an h5 title (with an optional note beside it), then its rows */
export function Group({
    title,
    note,
    children,
    testId,
}: {
    title: ReactNode;
    note?: ReactNode;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="flex flex-col gap-10" data-testid={testId}>
            <div className="flex items-baseline gap-8">
                <h5 className="text-h5">{title}</h5>
                {note && (
                    <span className="text-sub text-text-subtitle">{note}</span>
                )}
            </div>
            {children}
        </section>
    );
}

/** A smaller heading inside a group: a title for the rows under it, not a note */
export function SubHeading({ children }: { children: ReactNode }) {
    return (
        <p className="text-body text-text mt-8 px-12 font-medium">{children}</p>
    );
}
