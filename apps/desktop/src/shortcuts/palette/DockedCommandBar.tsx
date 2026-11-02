import clsx from "clsx";
import Shortcut from "@/components/ui/Shortcut";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Translate } from "../labels";
import {
    openPalette,
    closeDockedCommand,
    useCommandBarStore,
    type CommandRun,
} from "./commandBar";
import "./CommandPalette.css";

/**
 * The command bar docked at the top of the field (#354), asking a command's parameters one at a
 * time while what it makes shows live on the field. Mounted by the field, over its top edge, so
 * the field stays in view; the centered palette hands a command over to it.
 *
 * - Each step opens with an answer typed (the default, or one a one-liner filled ahead), selected
 *   so typing replaces it.
 * - Enter goes to the next step, and on the last one finishes.
 * - Backspace in an empty answer goes back a step; on the first, back to the palette's branch.
 * - Escape cancels the whole command, and everything is as it was before it began.
 */
export default function DockedCommandBar() {
    const docked = useCommandBarStore((s) => s.docked);
    if (!docked) return null;
    // A new command starts its steps afresh
    return (
        <DockedSteps
            key={commandKey(docked.run)}
            run={docked.run}
            prefill={docked.prefill}
            from={docked.from}
        />
    );
}

const runKeys = new WeakMap<CommandRun, number>();
let nextKey = 0;
const commandKey = (run: CommandRun): number => {
    if (!runKeys.has(run)) runKeys.set(run, nextKey++);
    return runKeys.get(run)!;
};

function DockedSteps({
    run,
    prefill: typed,
    from,
}: {
    run: CommandRun;
    prefill: readonly string[];
    from: readonly string[];
}) {
    // The one-liner's answers on the steps they answer
    const [prefill] = useState(() => run.fillAhead?.(typed) ?? typed);
    const { t: tolgeeT } = useTranslate();
    const t: Translate = (key, params) => tolgeeT(key, params as never);
    // A one-liner opens at the first step it didn't fill, or the last one, so one Enter finishes
    // it (sims B354); Backspace still goes back over what it filled
    const [opening] = useState(() => {
        const steps = run.preview(prefill);
        const at = Math.max(0, Math.min(prefill.length, steps.length - 1));
        return {
            answers: prefill.slice(0, at),
            text: prefill[at] ?? steps[at]?.initial ?? "",
        };
    });
    const [answers, setAnswers] = useState<readonly string[]>(opening.answers);
    const [text, setText] = useState(opening.text);
    const input = useRef<HTMLInputElement>(null);

    const index = answers.length;
    // What the field shows follows every keystroke, with a one-liner's later answers too, so the
    // whole line shows at once (sims B354)
    const steps = useMemo(
        () => run.preview([...answers, text, ...prefill.slice(index + 1)]),
        [run, answers, text, prefill, index],
    );
    const step = steps[index];

    // A command with nothing to ask is done as soon as it begins
    useEffect(() => {
        if (steps.length === 0) {
            run.finish([]);
            closeDockedCommand(run);
        }
    }, [run, steps.length]);

    // Each step opens with its answer selected, so typing replaces it
    useLayoutEffect(() => {
        input.current?.focus();
        input.current?.select();
    }, [index]);

    const cancel = () => {
        run.cancel();
        closeDockedCommand(run);
    };

    const back = () => {
        setText(answers[index - 1] ?? "");
        setAnswers(answers.slice(0, -1));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const handled = () => {
            event.preventDefault();
            // The bar's keys aren't the field's: Enter isn't Place, Escape isn't discard
            event.stopPropagation();
        };
        const last = index === steps.length - 1;
        if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
            handled();
            if (!step || step.invalid || (event.key === "Tab" && last)) return;
            const next = [...answers, text];
            if (last) {
                run.finish(next);
                closeDockedCommand(run);
                return;
            }
            const after = run.preview(next);
            setAnswers(next);
            setText(prefill[next.length] ?? after[next.length]?.initial ?? "");
        } else if (event.key === "Escape") {
            handled();
            cancel();
        } else if (event.key === "Tab" && event.shiftKey) {
            // Back a step, as in a form (sims B354); not out of the command
            handled();
            if (index > 0) back();
        } else if (event.key === "Backspace" && text === "") {
            handled();
            if (index > 0) back();
            else {
                // Back up the tree to the branch it was chosen from
                cancel();
                openPalette(from);
            }
        }
    };

    if (!step) return null;
    return (
        <div
            className="command-palette docked-bar rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 border"
            role="dialog"
            aria-label={run.path.join(" › ")}
            data-testid="docked-command-bar"
            data-shape-ui
        >
            <div className="docked-bar-row">
                <span className="docked-bar-path">
                    {run.path.map((part) => (
                        <span key={part} className="palette-crumb">
                            {part}
                            <CaretRightIcon size={12} aria-hidden />
                        </span>
                    ))}
                </span>
                <label
                    className="docked-bar-question"
                    htmlFor="docked-bar-input"
                >
                    {step.label}
                </label>
                <input
                    ref={input}
                    id="docked-bar-input"
                    className={clsx(
                        "docked-bar-input",
                        step.invalid && "docked-bar-invalid",
                    )}
                    data-testid="docked-command-input"
                    aria-invalid={step.invalid || undefined}
                    aria-describedby="docked-bar-status"
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            <ol className="docked-bar-steps" aria-hidden>
                {steps.map((s, i) => (
                    <li
                        key={s.key}
                        className={clsx(
                            "docked-bar-step",
                            i === index && "docked-bar-step-current",
                            i < index && "docked-bar-step-done",
                        )}
                        data-testid="docked-command-step"
                    >
                        {i < index
                            ? answers[i]
                            : i === index
                              ? text || s.initial
                              : (prefill[i] ?? s.initial)}
                    </li>
                ))}
            </ol>
            <div className="palette-footer" id="docked-bar-status">
                <span className="palette-footer-hint">
                    {step.invalid
                        ? t("commandPalette.notUnderstood")
                        : t("commandPalette.stepOf", {
                              step: index + 1,
                              count: steps.length,
                          })}
                </span>
                <span className="palette-footer-hint" aria-hidden>
                    <Shortcut binding="Enter" />
                    {index === steps.length - 1
                        ? (run.finishLabel ?? t("commandPalette.done"))
                        : t("commandPalette.next")}
                </span>
                <span className="palette-footer-hint" aria-hidden>
                    <Shortcut binding="Backspace" />
                    {t("commandPalette.back")}
                </span>
                <span className="palette-footer-hint" aria-hidden>
                    <Shortcut binding="Escape" />
                    {t("commandPalette.cancel")}
                </span>
            </div>
        </div>
    );
}
