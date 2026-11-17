import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Checkpoint, FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import tolgee from "@/global/singletons/Tolgee";
import {
    actionDisabledReason,
    isActionEnabled,
    runAction,
} from "@/shortcuts/registry";
import { fieldEditMode } from "../fieldEditModeStore";
import { useFieldLineActions } from "../useFieldEditModeActions";

/**
 * The Lines tab's commands greyed out where the edit would be refused, saying why, instead of a
 * toast after the press: Delete lines that would leave fewer than two on an axis, and Name lines
 * from their position when they already have those names.
 */

const field = vi.hoisted(() => ({ fp: undefined as unknown }));
const apply = vi.hoisted(() => vi.fn(async () => null));
vi.mock("../useApplyFieldEdits", () => ({
    useFieldProperties: () => field.fp,
    useApplyFieldEdits: () => apply,
}));

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const ref = (c: Checkpoint) => ({ axis: c.axis, id: c.id });

/** The template with only its first two Y lines: none of them can go */
const twoY: FieldProperties = {
    ...college,
    yCheckpoints: college.yCheckpoints.slice(0, 2),
} as FieldProperties;

beforeAll(async () => {
    await tolgee.run();
});
afterEach(() => {
    cleanup();
    act(() => fieldEditMode.exit());
    apply.mockClear();
});

const mount = (fp: FieldProperties, picked: readonly Checkpoint[]) => {
    field.fp = fp;
    act(() => {
        fieldEditMode.enter({ lines: true });
        fieldEditMode.select(picked.map(ref));
    });
    return renderHook(() => useFieldLineActions());
};

describe("Delete lines", () => {
    it("is greyed out where fewer than two lines would be left, saying why", () => {
        mount(twoY, [twoY.yCheckpoints[0]!]);
        expect(isActionEnabled("fieldEditDeleteLines")).toBe(false);
        expect(actionDisabledReason("fieldEditDeleteLines")).toBe(
            "At least 2 Y-checkpoints are required",
        );
        // Nothing is written, and nothing toasts
        expect(runAction("fieldEditDeleteLines")).toBe(false);
        expect(apply).not.toHaveBeenCalled();
    });

    it("runs where enough lines are left, with no reason", () => {
        mount(college, [college.xCheckpoints[1]!]);
        expect(isActionEnabled("fieldEditDeleteLines")).toBe(true);
        expect(actionDisabledReason("fieldEditDeleteLines")).toBeUndefined();
        expect(runAction("fieldEditDeleteLines")).toBe(true);
        expect(apply).toHaveBeenCalledOnce();
    });
});

describe("Name lines from their position", () => {
    it("is greyed out when the lines already have those names, saying so", () => {
        mount(college, [college.xCheckpoints[1]!]);
        expect(isActionEnabled("fieldEditResetNames")).toBe(false);
        expect(actionDisabledReason("fieldEditResetNames")).toBe(
            "Those lines already have the names their position gives them",
        );
    });
});
