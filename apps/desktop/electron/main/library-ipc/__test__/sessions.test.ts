// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ImportSessionRegistry, sessionDto } from "../sessions";

const file = (name: string) => ({
    path: `/Users/someone/private/${name}`,
    filename: name,
    sizeBytes: 10,
    type: "artwork" as const,
    tooLarge: false,
});

function registry(start = 0) {
    let t = start;
    const closed: string[] = [];
    const reg = new ImportSessionRegistry({
        idleMs: 30 * 60 * 1000,
        now: () => t,
        onClose: (s) => closed.push(s.sessionId),
    });
    return {
        reg,
        closed,
        advance: (ms: number) => {
            t += ms;
        },
    };
}

describe("ImportSessionRegistry", () => {
    it("hands out random ids and never a path", () => {
        const { reg } = registry();
        const session = reg.open(1, [file("a.png"), file("b.png")], null);
        const dto = sessionDto(session);
        expect(dto.sessionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(new Set(dto.files.map((f) => f.fileId)).size).toBe(2);
        expect(JSON.stringify(dto)).not.toContain("/Users/");
        expect(dto.files[0]).toEqual({
            fileId: dto.files[0].fileId,
            filename: "a.png",
            sizeBytes: 10,
            type: "artwork",
            tooLarge: false,
        });
    });

    it("refuses unknown, foreign and unknown-file ids", () => {
        const { reg } = registry();
        const session = reg.open(1, [file("a.png")], null);
        const [fileId] = session.files.keys();
        expect(reg.get(1, crypto.randomUUID())).toEqual({
            ok: false,
            code: "session-expired",
        });
        expect(reg.get(2, session.sessionId)).toEqual({
            ok: false,
            code: "session-expired",
        });
        expect(reg.get(1, session.sessionId, crypto.randomUUID())).toEqual({
            ok: false,
            code: "unknown-file",
        });
        const hit = reg.get(1, session.sessionId, fileId);
        expect(hit.ok && hit.file?.filename).toBe("a.png");
    });

    it("expires a session after 30 minutes idle, and use keeps it alive", () => {
        const { reg, closed, advance } = registry();
        const session = reg.open(1, [file("a.png")], null);
        advance(29 * 60 * 1000);
        expect(reg.get(1, session.sessionId).ok).toBe(true);
        advance(29 * 60 * 1000);
        expect(reg.get(1, session.sessionId).ok).toBe(true);
        advance(30 * 60 * 1000 + 1);
        expect(reg.get(1, session.sessionId)).toEqual({
            ok: false,
            code: "session-expired",
        });
        expect(closed).toEqual([session.sessionId]);
        expect(reg.size).toBe(0);
    });

    it("sweeps idle sessions and frees their bytes", () => {
        const { reg, advance } = registry();
        const session = reg.open(1, [file("a.png")], null);
        const [f] = session.files.values();
        f.artwork = new Uint8Array(8);
        advance(31 * 60 * 1000);
        reg.sweep();
        expect(reg.size).toBe(0);
        expect(f.artwork).toBeUndefined();
        expect(session.closed).toBe(true);
    });

    it("keeps one session per editor: a new pick closes the old one", () => {
        const { reg, closed } = registry();
        const first = reg.open(1, [file("a.png")], null);
        const other = reg.open(2, [file("c.png")], null);
        const second = reg.open(1, [file("b.png")], null);
        expect(closed).toEqual([first.sessionId]);
        expect(reg.get(1, first.sessionId).ok).toBe(false);
        expect(reg.get(1, second.sessionId).ok).toBe(true);
        expect(reg.get(2, other.sessionId).ok).toBe(true);
    });

    it("closes by id (own sessions only), by sender and all", () => {
        const { reg } = registry();
        const a = reg.open(1, [], null);
        expect(reg.closeById(2, a.sessionId)).toBe(false);
        expect(reg.closeById(1, a.sessionId)).toBe(true);
        reg.open(1, [], null);
        reg.open(2, [], null);
        reg.closeSender(1);
        expect(reg.size).toBe(1);
        reg.closeAll();
        expect(reg.size).toBe(0);
    });

    it("aborts a running artwork job when its session closes", () => {
        const { reg } = registry();
        const session = reg.open(1, [], null);
        const controller = new AbortController();
        session.artworkJob = controller;
        reg.closeSender(1);
        expect(controller.signal.aborted).toBe(true);
    });
});
