// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Checkpoint } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldEditRefusal } from "../refusal";

/**
 * A field edit's refusal, worked out beforehand so the control can say why it's greyed out
 * (Delete lines, Add checkpoint) instead of a toast after the press.
 */

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const ref = (c: Checkpoint) => ({ axis: c.axis, id: c.id });
const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key;

describe("fieldEditRefusal", () => {
    it("says why deleting all but one line on an axis would be refused", () => {
        const before = JSON.stringify(college);
        expect(
            fieldEditRefusal(
                college,
                {
                    edit: "removeCheckpoints",
                    args: { ids: college.yCheckpoints.slice(0, -1).map(ref) },
                },
                t,
            ),
        ).toBe('fieldProperties.checkpoint.minimumRequired:{"axis":"Y"}');
        // Only worked out: the field is untouched
        expect(JSON.stringify(college)).toBe(before);
    });

    it("gives nothing for an edit that would run, or with no field or no edit", () => {
        const one = {
            edit: "removeCheckpoints" as const,
            args: { ids: [ref(college.xCheckpoints[1]!)] },
        };
        expect(fieldEditRefusal(college, one, t)).toBeUndefined();
        expect(fieldEditRefusal(undefined, one, t)).toBeUndefined();
        expect(fieldEditRefusal(college, null, t)).toBeUndefined();
        expect(fieldEditRefusal(college, [], t)).toBeUndefined();
    });

    it("gives nothing for adding a checkpoint where there is a gap for it", () => {
        // Add X goes in the widest gap; on the template there is one, so it runs
        expect(
            fieldEditRefusal(
                college,
                { edit: "addCheckpoint", args: { axis: "x", mirror: true } },
                t,
                { allowGeometryChange: false },
            ),
        ).toBeUndefined();
    });
});
