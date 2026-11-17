import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import { applyFieldEditsMutationOptions } from "@/hooks/queries";
import type { FieldEditRequest, FieldEditResult } from "@/field/edits";
import {
    createCheckpointNamer,
    fieldEditIssueMessage,
} from "@/field/edits/messages";

type Translate = Parameters<typeof fieldEditIssueMessage>[1];

/**
 * Tells the user how a field edit went: the reason it was refused, else each thing worth knowing
 * about it (`diff.warnings`, once per kind).
 */
export function toastFieldEditResult(result: FieldEditResult, t: Translate) {
    const error = result.diff.errors[0];
    if (error) {
        toast.error(fieldEditIssueMessage(error, t, true));
        return;
    }
    const seen = new Set<string>();
    for (const warning of result.diff.warnings) {
        if (seen.has(warning.code)) continue;
        seen.add(warning.code);
        toast.warning(fieldEditIssueMessage(warning, t));
    }
}

/**
 * Applies field edits (#823) as one undo step, named in the app's language, and toasts what the
 * user needs to know: a refusal, the warnings, or a failed write. Resolves with the result, or
 * undefined when the write failed. `allowGeometryChange: false` refuses any edit that would
 * resize or move the field (the palette's actions).
 */
export function useApplyFieldEdits({
    allowGeometryChange,
}: { allowGeometryChange?: boolean } = {}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const namer = useMemo(() => createCheckpointNamer(t), [t]);
    const { mutateAsync } = useMutation(
        applyFieldEditsMutationOptions(queryClient, {
            namer,
            allowGeometryChange,
        }),
    );
    return useCallback(
        async (
            edits: FieldEditRequest | readonly FieldEditRequest[],
        ): Promise<FieldEditResult | undefined> => {
            let result: FieldEditResult;
            try {
                result = await mutateAsync(edits);
            } catch (error) {
                console.error("Field edit failed", error);
                toast.error(t("fieldEdits.failed"));
                return undefined;
            }
            toastFieldEditResult(result, t);
            return result;
        },
        [mutateAsync, t],
    );
}
