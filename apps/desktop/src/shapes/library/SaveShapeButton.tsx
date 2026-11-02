import clsx from "clsx";
import tolgee from "@/global/singletons/Tolgee";
import { useState } from "react";
import { StarIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { keepFocus } from "../editor/keepFocus";
import { Tip } from "@/components/ui/Tip";
import { saveShape, type SavableShape } from "./saveShape";
import { suggestedName } from "./savedShapes";

/**
 * ☆ Save (#353, spec #344 story 26–27): in the floating editor (an icon, #429) and at the bottom of the inspector's
 * shape section. It asks for a name in place, offering the kind, its spacing and how it's filled,
 * and an optional description (#393), then keeps the shape's kind, intervals and distribution in
 * the user's library and the show, starred.
 */
export function SaveShapeButton({
    shape,
    stepPx,
    className,
    compact = false,
    testId = "save-shape",
}: {
    shape: SavableShape;
    stepPx: number;
    /** The button's look where it sits */
    className?: string;
    /** The star alone, its words in the tooltip (the floating editor, #429) */
    compact?: boolean;
    testId?: string;
}) {
    const queryClient = useQueryClient();
    const [name, setName] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [saved, setSaved] = useState<string | null>(null);
    const savedAs = (name: string) =>
        tolgee.t("shapes.save.savedAs", "Saved as {name}", { name });

    if (name === null)
        return (
            <Tip
                label={
                    saved && compact
                        ? savedAs(saved)
                        : tolgee.t(
                              "shapes.save.tip",
                              "Save this shape to your library, starred",
                          )
                }
            >
                <button
                    type="button"
                    aria-label={
                        saved && compact
                            ? savedAs(saved)
                            : tolgee.t(
                                  "shapes.save.ariaLabel",
                                  "Save this shape to your library",
                              )
                    }
                    onPointerDown={keepFocus}
                    onClick={() => {
                        setSaved(null);
                        setDescription("");
                        setName(
                            suggestedName(
                                shape.kind,
                                shape.params,
                                shape.spots,
                                stepPx,
                            ),
                        );
                    }}
                    className={clsx("flex items-center gap-4", className)}
                    data-testid={testId}
                >
                    <StarIcon size={14} weight={saved ? "fill" : "regular"} />
                    {!compact &&
                        (saved
                            ? savedAs(saved)
                            : tolgee.t("shapes.save.button", "Save"))}
                </button>
            </Tip>
        );

    const finish = async () => {
        const trimmed = name.trim();
        if (trimmed === "") return;
        setName(null);
        const done = await saveShape(
            shape,
            { name: trimmed, description },
            stepPx,
            queryClient,
        );
        setSaved(done.name);
    };
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault();
                void finish();
            }}
            data-testid={`${testId}-form`}
        >
            <input
                autoFocus
                aria-label={tolgee.t(
                    "shapes.save.nameLabel",
                    "Name of the saved shape",
                )}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                    // Enter and Escape answer the name, not the shape: Escape keeps it open
                    e.stopPropagation();
                    if (e.key === "Escape") setName(null);
                }}
                className="rounded-4 border-stroke bg-fg-1 text-body text-text w-[12rem] border px-4 py-1"
                data-testid={`${testId}-name`}
            />
            <input
                aria-label={tolgee.t(
                    "shapes.save.descriptionLabel",
                    "Description of the saved shape (optional)",
                )}
                placeholder={tolgee.t(
                    "shapes.save.descriptionPlaceholder",
                    "Description (optional)",
                )}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                    // Enter and Escape answer the description, not the shape: Escape keeps it open
                    e.stopPropagation();
                    if (e.key === "Escape") setName(null);
                }}
                className="rounded-4 border-stroke bg-fg-1 text-body text-text w-[12rem] border px-4 py-1"
                data-testid={`${testId}-description`}
            />
            <div className="flex items-center gap-4">
                <button
                    type="submit"
                    disabled={name.trim() === ""}
                    className="bg-accent text-text-invert rounded-4 px-8 py-1 font-medium hover:opacity-90 disabled:opacity-50"
                    data-testid={`${testId}-confirm`}
                >
                    {tolgee.t("shapes.save.button", "Save")}
                </button>
                <button
                    type="button"
                    onClick={() => setName(null)}
                    className="rounded-4 hover:bg-fg-2 px-4 py-1"
                >
                    {tolgee.t("shapes.save.cancel", "Cancel")}
                </button>
            </div>
        </form>
    );
}
