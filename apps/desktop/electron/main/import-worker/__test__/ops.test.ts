// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
    TEMPLATE_SURFACES,
    artworkTemplateFiles,
} from "../../../../src/view3d/core/artworkTemplates";
import { runWorkerJob, templateFile } from "../ops";
import type { ModelImportResult } from "../../model-import/types";
import type { WorkerResponse } from "../protocol";

const FIXTURES = path.join(__dirname, "../../model-import/__test__/fixtures");

describe("import worker ops", () => {
    it("makes each template format exactly as artworkTemplateFiles does", () => {
        const floor = TEMPLATE_SURFACES.find((s) => s.process === "floor")!;
        for (const surface of [TEMPLATE_SURFACES[0], floor]) {
            const all = artworkTemplateFiles(surface, {
                deflate: (d) => deflateSync(d),
            });
            for (const format of ["svg", "pdf", "png"] as const) {
                const expected = all.find((f) =>
                    f.name.endsWith(`.${format}`),
                )!;
                const made = templateFile(surface, format);
                expect(made.filename).toBe(expected.name);
                expect(made.mimeType).toBe(expected.mimeType);
                const bytes =
                    typeof expected.data === "string"
                        ? new TextEncoder().encode(expected.data)
                        : expected.data;
                expect(Buffer.from(made.bytes).equals(Buffer.from(bytes))).toBe(
                    true,
                );
            }
        }
    });

    it("posts stages, then one answer, for a model job", async () => {
        const bytes = new Uint8Array(
            await readFile(path.join(FIXTURES, "equipment-clean-kit.glb")),
        );
        const posted: WorkerResponse[] = [];
        await runWorkerJob(
            {
                jobId: 7,
                op: "model-import",
                input: { file: { filename: "a.glb", bytes }, choices: {} },
            },
            (r) => posted.push(r),
        );
        const answers = posted.filter((r) => "ok" in r);
        expect(answers).toHaveLength(1);
        expect(answers[0]).toMatchObject({ jobId: 7, ok: true });
        // The material list (Q67) survives the utility process's clone.
        const cloned = structuredClone(answers[0]) as {
            output: ModelImportResult;
        };
        expect(
            cloned.output.report.materials.map((m) => [m.name, m.fileSlot]),
        ).toEqual([
            ["PoleMetal", null],
            ["Silk", "silk"],
        ]);
        expect(posted.filter((r) => "stage" in r).length).toBeGreaterThan(3);
    });

    it("answers not-found for an unknown surface and failed for a bad op", async () => {
        const posted: WorkerResponse[] = [];
        await runWorkerJob(
            {
                jobId: 1,
                op: "template",
                input: { surfaceId: "nope", format: "svg" },
            },
            (r) => posted.push(r),
        );
        await runWorkerJob({ jobId: 2, op: "bogus" } as never, (r) =>
            posted.push(r),
        );
        expect(posted).toMatchObject([
            { jobId: 1, ok: false, error: { code: "not-found" } },
            { jobId: 2, ok: false, error: { code: "failed" } },
        ]);
    });
});
