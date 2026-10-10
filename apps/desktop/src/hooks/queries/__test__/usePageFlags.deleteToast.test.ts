import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PageDeleteWithMovesResult } from "@/db-functions/pageDelete";
import {
    deletePageYankWithMovesMutationOptions,
    deletePagesWithMovesMutationOptions,
} from "../usePageFlags";

/**
 * The toast after **Delete page and its moves** (defined-coordinates 08): what happened in set and
 * count terms, with **Undo**, which runs the app's normal undo.
 */

afterEach(() => vi.restoreAllMocks());

const result: PageDeleteWithMovesResult = {
    deleted: [{ id: 2 } as PageDeleteWithMovesResult["deleted"][number]],
    deletedNames: ["2"],
    grownPages: [{ id: 1, name: "1", order: 1, renamed: false, counts: 32 }],
    changedPages: [
        { id: 3, name: "3", order: 3, renamed: true },
        { id: 4, name: "4", order: 4, renamed: true },
    ],
};

type OnSuccess = (data: PageDeleteWithMovesResult, ...rest: unknown[]) => void;

describe("the delete-with-moves toast", () => {
    for (const [name, options] of [
        ["Delete page and its moves", deletePagesWithMovesMutationOptions],
        ["yank", deletePageYankWithMovesMutationOptions],
    ] as const)
        it(`${name}: says what changed and offers Undo, which runs the app's undo`, () => {
            const success = vi
                .spyOn(toast, "success")
                .mockImplementation(() => 0);
            const undo = vi.fn();
            const qc = new QueryClient();
            (options(qc, undo).onSuccess as OnSuccess)(result);
            expect(success).toHaveBeenCalledTimes(1);
            const [message, opts] = success.mock.calls[0]!;
            expect(message).toBe(
                "Deleted Page 2 · Page 1 is now 32 counts · old Pages 3–4 changed",
            );
            const action = opts!.action as {
                label: string;
                onClick: () => void;
            };
            expect(action.label).toBe("Undo");
            action.onClick();
            expect(undo).toHaveBeenCalledTimes(1);
        });

    it("says nothing when nothing was deleted, and has no Undo without one", () => {
        const success = vi.spyOn(toast, "success").mockImplementation(() => 0);
        const qc = new QueryClient();
        (deletePagesWithMovesMutationOptions(qc).onSuccess as OnSuccess)({
            ...result,
            deleted: [],
        });
        expect(success).not.toHaveBeenCalled();
        (deletePagesWithMovesMutationOptions(qc).onSuccess as OnSuccess)(
            result,
        );
        expect(success.mock.calls[0]![1]!.action).toBeUndefined();
    });
});
