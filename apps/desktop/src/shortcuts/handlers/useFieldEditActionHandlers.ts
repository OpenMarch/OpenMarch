import { toast } from "sonner";
import { useTranslate } from "@tolgee/react";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useApplyFieldEdits } from "@/hooks/useApplyFieldEdits";
import type { FieldEditRequest, FieldEditResult } from "@/field/edits";
import { fieldEditRefusal } from "@/field/edits/refusal";
import { useFieldProperties } from "@/field/editMode/useApplyFieldEdits";
import { useActionHandler } from "../useActionHandler";
import type { ActionArgs } from "../definitions";

/**
 * Field edits (#823) the palette reaches: the ones that need no checkpoint picked. The rest
 * (remove, move, update, settings, templates) are called by name through `applyFieldEdits` until
 * the Edit field mode (#824) gives them a selection.
 *
 * None of them changes the field's size or center: a series stops at the outermost lines, and
 * any edit that would still resize the field is refused (`allowGeometryChange: false`). Refusals,
 * warnings and failed writes are toasted by `useApplyFieldEdits`.
 */
export function useFieldEditActionHandlers() {
    const { t } = useTranslate();
    const databaseReady = useDatabaseReady();
    const applyFieldEdits = useApplyFieldEdits({ allowGeometryChange: false });

    const apply = (
        edit: FieldEditRequest,
        done?: (result: FieldEditResult) => void,
    ) =>
        void applyFieldEdits(edit).then((result) => {
            if (result?.diff.ok) done?.(result);
        });

    const addedSeries = (axis: "x" | "y") => (result: FieldEditResult) => {
        const count = result.diff.checkpoints.added.length;
        if (count === 0) toast.message(t("fieldEdits.nothingAdded"));
        else
            toast.success(
                t("fieldEdits.seriesAdded", {
                    count,
                    axis: axis.toUpperCase(),
                }),
            );
    };
    const number = (args: ActionArgs | undefined, key: string) =>
        Number(args?.[key]);

    const options = { enabled: databaseReady };
    useAddCheckpointActions(apply, databaseReady);
    useActionHandler(
        "fieldAddXCheckpointSeries",
        (args) =>
            apply(
                {
                    edit: "addCheckpointSeries",
                    args: {
                        axis: "x",
                        every: number(args, "every"),
                        from: 0,
                        to: Math.abs(number(args, "to")),
                        mirror: true,
                    },
                },
                addedSeries("x"),
            ),
        options,
    );
    useActionHandler(
        "fieldAddYCheckpointSeries",
        (args) =>
            apply(
                {
                    edit: "addCheckpointSeries",
                    args: {
                        axis: "y",
                        every: number(args, "every"),
                        from: 0,
                        // Asked as steps behind the front; stored negative
                        to: -Math.abs(number(args, "to")),
                    },
                },
                addedSeries("y"),
            ),
        options,
    );
}

/**
 * Add X or Y checkpoint: one more line in the widest gap, greyed out, saying why, when there's no
 * gap for it (instead of a toast after the press)
 */
function useAddCheckpointActions(
    apply: (edit: FieldEditRequest) => void,
    databaseReady: boolean,
) {
    const { t } = useTranslate();
    const fp = useFieldProperties();
    const addX: FieldEditRequest = {
        edit: "addCheckpoint",
        args: { axis: "x", mirror: true },
    };
    const addY: FieldEditRequest = {
        edit: "addCheckpoint",
        args: { axis: "y" },
    };
    const refusal = (edit: FieldEditRequest) => () =>
        databaseReady
            ? fieldEditRefusal(fp, edit, t, { allowGeometryChange: false })
            : undefined;
    const addOptions = (edit: FieldEditRequest) => ({
        enabled: () => databaseReady && refusal(edit)() === undefined,
        disabledReason: refusal(edit),
    });
    useActionHandler(
        "fieldAddXCheckpoint",
        () => apply(addX),
        addOptions(addX),
    );
    useActionHandler(
        "fieldAddYCheckpoint",
        () => apply(addY),
        addOptions(addY),
    );
}
