import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    ReportSubmitError,
    submitReportFromMain,
    type SubmitDeps,
} from "../reportSubmit";

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-submit-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

interface Call {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

/** A stand-in for the editor API and the bucket that records what it was sent. */
function fakeServer(options: { failCreate?: number } = {}) {
    const calls: Call[] = [];
    let uploads = 0;
    const fetchFake = (async (input: string, init: RequestInit) => {
        const headers = (init.headers ?? {}) as Record<string, string>;
        let body: unknown = init.body;
        if (init.method === "PUT")
            body = Buffer.from(await new Response(init.body).arrayBuffer());
        else if (typeof init.body === "string") body = JSON.parse(init.body);
        calls.push({ url: input, method: init.method ?? "GET", headers, body });

        if (input.endsWith("v1/report_uploads")) {
            uploads += 1;
            return Response.json(
                {
                    signed_id: `signed-${uploads}`,
                    file: (body as { file: string }).file,
                    direct_upload: {
                        url: `https://bucket.example/put/${uploads}`,
                        headers: { "Content-MD5": "x", "Content-Type": "y" },
                    },
                },
                { status: 201 },
            );
        }
        if (input.startsWith("https://bucket.example/put/"))
            return new Response(null, { status: 200 });
        if (input.endsWith("v1/reports")) {
            if (options.failCreate)
                return Response.json(
                    { error: "Too many reports today" },
                    { status: options.failCreate },
                );
            return Response.json({ report: { id: 46 } }, { status: 201 });
        }
        return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    return { calls, fetch: fetchFake };
}

const deps = (f: typeof fetch, token: string | null = "tok"): SubmitDeps => ({
    apiBase: "https://app.example/api/editor/",
    getToken: () => Promise.resolve(token),
    fetch: f,
});

describe("submitReportFromMain", () => {
    it("uploads each file with its size and MD5, then creates the report with the signed ids", async () => {
        const showPath = path.join(dir, "show.dots");
        const showBytes = Buffer.from("SQLite format 3\0 scrubbed show");
        fs.writeFileSync(showPath, showBytes);
        const diagPath = path.join(dir, "diagnostics.json");
        fs.writeFileSync(diagPath, "[]");
        const server = fakeServer();

        const result = await submitReportFromMain(
            deps(server.fetch),
            { kind: "broken", channel: "desktop", title: "T", answers: {} },
            [
                {
                    slot: "show_file",
                    path: showPath,
                    filename: "show.dots",
                    contentType: "application/octet-stream",
                },
                {
                    slot: "diagnostics",
                    path: diagPath,
                    filename: "diagnostics.json",
                    contentType: "application/json",
                },
            ],
        );

        expect(result).toEqual({ id: 46 });
        expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
            "POST https://app.example/api/editor/v1/report_uploads",
            "PUT https://bucket.example/put/1",
            "POST https://app.example/api/editor/v1/report_uploads",
            "PUT https://bucket.example/put/2",
            "POST https://app.example/api/editor/v1/reports",
        ]);
        const start = server.calls[0];
        expect(start.headers.Authorization).toBe("Bearer tok");
        expect(start.body).toEqual({
            file: "show_file",
            blob: {
                filename: "show.dots",
                byte_size: showBytes.length,
                checksum: createHash("md5").update(showBytes).digest("base64"),
                content_type: "application/octet-stream",
            },
        });
        // The streamed body states its length: R2's presigned PUT signs it
        expect(server.calls[1].headers).toEqual({
            "Content-MD5": "x",
            "Content-Type": "y",
            "Content-Length": String(showBytes.length),
        });
        expect(server.calls[1].body).toEqual(showBytes);
        expect(server.calls[4].body).toEqual({
            report: {
                kind: "broken",
                channel: "desktop",
                title: "T",
                answers: {},
                files: { show_file: "signed-1", diagnostics: "signed-2" },
            },
        });
    });

    it("refuses when signed out, and passes the API's error message on", async () => {
        await expect(
            submitReportFromMain(deps(fakeServer().fetch, null), {}, []),
        ).rejects.toMatchObject({ status: 401 });

        const error = await submitReportFromMain(
            deps(fakeServer({ failCreate: 429 }).fetch),
            {},
            [],
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ReportSubmitError);
        expect(error).toMatchObject({
            status: 429,
            message: "Too many reports today",
        });
    });
});
