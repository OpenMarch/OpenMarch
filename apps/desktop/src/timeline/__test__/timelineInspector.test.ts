// cspell:ignore NONFOUNDING
import { describe, expect, it } from "vitest";
import {
    groupDiagnosticsByTransition,
    type MarcherInspection,
} from "../timelineInspector";
import {
    arcShow,
    beatOfSpanKind,
    ftlEmptyShow,
    golden,
    inspect,
} from "./inspectorFixtures";
import { createResolver } from "@openmarch/core";

/**
 * P8.5: what the inspector reads for a marcher at a beat, on the golden vectors (spec 12.4) and
 * QA-DG-4. Every field comes from `explain` or the rows it names.
 */

const codes = (i: MarcherInspection) => i.diagnostics.map((d) => d.code);

describe("span kinds", () => {
    it("G1: a founding span in the middle of a direct move", () => {
        const i = inspect(golden("G1"), 1, 8);
        expect(i.span).toMatchObject({
            kind: "founding",
            start: 0,
            end: 16,
            slot: 0,
        });
        expect(i.progress).toBeCloseTo(0.5);
        expect(i.layer).toBe(0);
        expect(i.origin).toEqual({ kind: "home", xy: [0, 0] });
        expect(i.transition).toMatchObject({
            id: 1,
            timelineId: 1,
            timelineName: "Opener",
            style: "direct",
            order: "inherit",
            slotCount: 1,
            bulge: null,
            waypoints: 0,
            destination: {
                kind: "shape",
                shapeId: 1,
                name: "S1",
                shape: "line",
            },
        });
        expect(i.ftl).toBeNull();
        expect(i.diagnostics).toEqual([]);
    });

    it("a hold after the last move: no transition, no layer, no progress, from the last span", () => {
        const i = inspect(golden("G1"), 1, 20);
        expect(i.span).toMatchObject({ kind: "hold", start: 16 });
        expect(i.span.end).toBe(Infinity);
        expect(i.transition).toBeNull();
        expect(i.layer).toBeNull();
        expect(i.progress).toBeNull();
        expect(i.origin).toMatchObject({
            kind: "span",
            span: "founding",
            transitionId: 1,
            xy: [16, 0],
        });
    });

    it("the leading hold starts at home", () => {
        const i = inspect(golden("G5"), 2, 4);
        expect(i.span).toMatchObject({ kind: "hold", start: -Infinity });
        expect(i.origin.kind).toBe("home");
    });

    it("G5: a join rebases from home, with D-REBASE", () => {
        const show = golden("G5");
        const i = inspect(show, 2, beatOfSpanKind(show, 2, "join"));
        expect(i.span.kind).toBe("join");
        expect(i.span.start).toBe(8);
        expect(i.progress).not.toBeNull();
        expect(codes(i)).toEqual(["D-REBASE"]);
        expect(i.diagnostics[0]).toMatchObject({
            level: "info",
            transitionId: 1,
            marcherId: 2,
        });
    });

    it("G3: a resume after a steal, on the lower layer", () => {
        const show = golden("G3");
        const i = inspect(show, 1, beatOfSpanKind(show, 1, "resume"));
        expect(i.span.kind).toBe("resume");
        expect(i.origin).toMatchObject({ kind: "span" });
        expect(codes(i)).toContain("D-REBASE");
        // The layer is the assignment's own, not the stealing row's
        const layers = [
            beatOfSpanKind(show, 1, "resume", 0),
            beatOfSpanKind(show, 1, "resume", 1),
        ].map((beat) => inspect(show, 1, beat).layer);
        expect(layers).toEqual([1, 0]);
    });

    it("G3: the stealing span is on the layer above, and starts from the span it stole from", () => {
        const i = inspect(golden("G3"), 1, 8);
        expect(i.layer).toBe(2);
        expect(i.span.kind).toBe("founding");
        expect(i.origin).toMatchObject({
            kind: "span",
            span: "founding",
            transitionId: 2,
        });
    });
});

describe("path parameters", () => {
    it("an arc shows its bulge", () => {
        const i = inspect(arcShow(), 1, 4);
        expect(i.transition).toMatchObject({ style: "arc", bulge: 0.25 });
    });

    it("G13: a shapeless transition shows its individual points", () => {
        const i = inspect(golden("G13"), 1, 4);
        expect(i.transition?.destination).toEqual({
            kind: "points",
            count: 3,
        });
        expect(i.transition?.slotCount).toBe(3);
    });
});

describe("follow the leader", () => {
    it("G6: a founding member has its place in the order, its order source and its target", () => {
        const show = golden("G6");
        const i = inspect(show, 1, 8);
        expect(i.span.kind).toBe("founding");
        expect(i.transition).toMatchObject({
            id: 2,
            style: "follow_the_leader",
            order: "inherit",
            slotCount: 4,
        });
        expect(i.ftl).not.toBeNull();
        expect(i.ftl!.q).toEqual(expect.any(Number));
        expect(i.ftl!.memberCount).toBe(4);
        expect(i.ftl!.orderSource).toEqual({
            kind: "inherit",
            fromTransitionId: 1,
        });
        expect(i.ftl!.target).toEqual([expect.any(Number), expect.any(Number)]);
        expect(i.diagnostics).toEqual([]);
    });

    it("G6: the members' places are 0 to m-1, each once", () => {
        const show = golden("G6");
        const qs = [1, 2, 3, 4].map((m) => inspect(show, m, 8).ftl!.q);
        expect([...qs].sort()).toEqual([0, 1, 2, 3]);
    });

    it("G11: a late joiner isn't in the member order, with D-FTL-NONFOUNDING", () => {
        const show = golden("G11");
        const i = inspect(show, 1, 10);
        expect(i.span.kind).toBe("join");
        expect(i.ftl!.q).toBeNull();
        expect(codes(i)).toEqual(["D-FTL-NONFOUNDING"]);
        expect(i.diagnostics[0]!.level).toBe("warning");
        // The others are founders and carry no such warning
        expect(codes(inspect(show, 2, 10))).not.toContain("D-FTL-NONFOUNDING");
    });

    it("G12: the stolen leader resumes without a member place", () => {
        const show = golden("G12");
        const beat = beatOfSpanKind(show, 4, "resume");
        const i = inspect(show, 4, beat);
        expect(i.span.kind).toBe("resume");
        expect(i.transition?.id).toBe(2);
        expect(i.ftl!.q).toBeNull();
        expect(codes(i)).toContain("D-FTL-NONFOUNDING");
    });

    it("G12: while stolen, the marcher is in the steal's own transition at layer 1", () => {
        const i = inspect(golden("G12"), 4, 7);
        expect(i.transition?.id).toBe(5);
        expect(i.layer).toBe(1);
    });
});

describe("diagnostics", () => {
    it("G9: a vacant slot is on the transition's marchers' explanations", () => {
        const i = inspect(golden("G9"), 2, 8);
        const vacant = i.diagnostics.filter((d) => d.code === "D-VACANT");
        expect(vacant.length).toBeGreaterThan(0);
        expect(vacant[0]).toMatchObject({
            level: "warning",
            marcherId: null,
        });
        expect(vacant.map((d) => d.slot)).toContain(3);
    });

    it("G10: the order fallback is info, on the FTL transition", () => {
        const i = inspect(golden("G10"), 2, 8);
        const fallback = i.diagnostics.find(
            (d) => d.code === "D-ORDER-FALLBACK",
        );
        expect(fallback).toMatchObject({ level: "info", transitionId: 2 });
        expect(i.ftl!.orderSource).toEqual({ kind: "slot", fallback: true });
    });

    it("QA-DG-4: no founders raises D-FTL-EMPTY", () => {
        const i = inspect(ftlEmptyShow(), 1, 8);
        expect(codes(i)).toContain("D-FTL-EMPTY");
        expect(
            i.diagnostics.find((d) => d.code === "D-FTL-EMPTY"),
        ).toMatchObject({ level: "warning", transitionId: 2 });
        expect(i.ftl!.q).toBeNull();
        expect(i.ftl!.memberCount).toBe(0);
    });

    it("includes the marcher's diagnostics from other beats, once each", () => {
        // Before the join the marcher holds, but the rebase on its later span is still its own
        const show = golden("G5");
        const i = inspect(show, 2, 4);
        expect(codes(i)).toEqual(["D-REBASE"]);
        const during = inspect(show, 2, 10);
        expect(codes(during)).toEqual(["D-REBASE"]);
    });

    it("a clean show has none", () => {
        for (const name of ["G1", "G2", "G4", "G6", "G7", "G8"])
            for (const m of golden(name).marchers) {
                const i = inspect(golden(name), m.id, 2);
                expect(
                    i.diagnostics.filter(
                        (d) => d.level === "warning" && d.marcherId !== null,
                    ),
                ).toEqual([]);
            }
    });
});

describe("groupDiagnosticsByTransition", () => {
    it("groups the show's diagnostics by transition, in id order", () => {
        const diagnostics = createResolver(golden("G9")).diagnostics();
        const groups = groupDiagnosticsByTransition(diagnostics);
        expect(groups.map((g) => g.transitionId)).toEqual(
            [...new Set(diagnostics.map((d) => d.transitionId))].sort(
                (a, b) => a - b,
            ),
        );
        expect(groups.flatMap((g) => g.diagnostics)).toHaveLength(
            diagnostics.length,
        );
    });
});
