import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { moveMarchersOnPageMutationOptions } from "@/hooks/queries/useMarcherPages";
import {
    createMarchersMutationOptions,
    deleteMarchersMutationOptions,
} from "@/hooks/queries/useMarchers";
import { conToastError } from "@/utilities/utils";
import {
    TIMELINE_DB_ERROR_MESSAGE,
    TIMELINE_ERROR_MESSAGES,
} from "../timelineErrorMessages";

/**
 * P8.6: the timeline's write paths toast the mapped message (never the raw code), and keep the
 * old text for an error that isn't a timeline refusal.
 */

vi.mock("@/utilities/utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/utilities/utils")>()),
    conToastError: vi.fn(),
}));

afterEach(() => vi.mocked(conToastError).mockReset());

const fail = (options: { onError?: unknown }, error: unknown) =>
    (options.onError as (e: unknown, v: unknown, c?: unknown) => void)(
        error,
        {},
    );

const toasted = () => vi.mocked(conToastError).mock.calls[0]![0];

describe("timeline write paths toast the mapped message", () => {
    it("a refused move (P7.2)", () => {
        fail(
            moveMarchersOnPageMutationOptions(),
            new TimelineWriteError("E-A3", "overlap"),
        );
        expect(toasted()).toBe(TIMELINE_ERROR_MESSAGES["E-A3"]!.defaultMessage);
    });

    it("a refused move's E-ARGS keeps its own words", () => {
        fail(
            moveMarchersOnPageMutationOptions(),
            new TimelineWriteError("E-ARGS", "marcher 3 has no move here"),
        );
        expect(toasted()).toBe("marcher 3 has no move here");
    });

    it("creating marchers (P7.3)", () => {
        fail(
            createMarchersMutationOptions(new QueryClient()),
            new TimelineWriteError("E-DB", "x"),
        );
        expect(toasted()).toBe(TIMELINE_DB_ERROR_MESSAGE.defaultMessage);
    });

    it("deleting marchers (P7.3)", () => {
        fail(
            deleteMarchersMutationOptions(new QueryClient()),
            new TimelineWriteError("E-T6", "x"),
        );
        expect(toasted()).toBe(TIMELINE_ERROR_MESSAGES["E-T6"]!.defaultMessage);
    });

    it("a page-mode error keeps its old text", () => {
        fail(createMarchersMutationOptions(new QueryClient()), new Error("x"));
        expect(toasted()).toBe("Error creating marchers");
    });
});
