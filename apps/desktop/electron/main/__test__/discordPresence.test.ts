import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    connectDiscordIpc,
    createFrameDecoder,
    discordIpcPaths,
    encodeFrame,
    OP_CLOSE,
    OP_FRAME,
    OP_HANDSHAKE,
    OP_PING,
    OP_PONG,
    type DiscordFrame,
} from "../discord/discordIpc";
import {
    createDiscordPresence,
    presenceActivity,
} from "../discord/discordPresence";

const t = (key: string) => `<${key}>`;

describe("frames", () => {
    it("round-trips a frame split across chunks and two frames in one chunk", () => {
        const decode = createFrameDecoder();
        const a = encodeFrame(OP_FRAME, { cmd: "A", text: "é" });
        const b = encodeFrame(OP_PING, { n: 1 });
        expect(decode(a.subarray(0, 5))).toEqual([]);
        expect(decode(Buffer.concat([a.subarray(5), b]))).toEqual([
            { op: OP_FRAME, data: { cmd: "A", text: "é" } },
            { op: OP_PING, data: { n: 1 } },
        ]);
    });

    it("refuses a frame too long to be Discord's", () => {
        const header = Buffer.alloc(8);
        header.writeInt32LE(OP_FRAME, 0);
        header.writeInt32LE(10_000_000, 4);
        expect(() => createFrameDecoder()(header)).toThrow(/length/);
    });
});

describe("discordIpcPaths", () => {
    it("uses Windows named pipes 0 to 9", () => {
        const paths = discordIpcPaths("win32", {});
        expect(paths).toHaveLength(10);
        expect(paths[0]).toBe("\\\\?\\pipe\\discord-ipc-0");
    });

    it("looks in the runtime folder first, then Flatpak and Snap, on Linux", () => {
        const paths = discordIpcPaths("linux", {
            XDG_RUNTIME_DIR: "/run/user/1000/",
        });
        expect(paths[0]).toBe("/run/user/1000/discord-ipc-0");
        expect(paths).toContain(
            "/run/user/1000/app/com.discordapp.Discord/discord-ipc-0",
        );
        expect(paths).toContain("/run/user/1000/snap.discord/discord-ipc-9");
    });

    it("uses TMPDIR on macOS and /tmp with nothing set", () => {
        expect(
            discordIpcPaths("darwin", { TMPDIR: "/var/folders/x/T/" })[0],
        ).toBe("/var/folders/x/T/discord-ipc-0");
        expect(discordIpcPaths("darwin", {})[0]).toBe("/tmp/discord-ipc-0");
    });
});

describe("presenceActivity", () => {
    const started = 1_700_000_000_000;

    it("says the launch page, with no elapsed time", () => {
        const activity = presenceActivity(
            { showPath: "", isNewShowDraft: false },
            started,
            t,
        );
        expect(activity.details).toBe("<discord.presence.launchPage>");
        expect(activity.timestamps).toBeUndefined();
        expect(activity.state).toBeUndefined();
    });

    it("says the person is designing a show, and never names it", () => {
        const activity = presenceActivity(
            { showPath: "/shows/Fall Show 2026.dots", isNewShowDraft: false },
            started,
            t,
        );
        expect(activity.details).toBe("<discord.presence.designing>");
        expect(activity.state).toBeUndefined();
        expect(activity.timestamps).toEqual({ start: started });
        expect(JSON.stringify(activity)).not.toContain("Fall Show");
    });

    it("names the show on a second line only when asked", () => {
        const activity = presenceActivity(
            { showPath: "/shows/Fall Show 2026.dots", isNewShowDraft: false },
            started,
            t,
            true,
        );
        expect(activity.details).toBe("<discord.presence.designing>");
        expect(activity.state).toBe("Fall Show 2026");
    });

    it("cuts a long name without splitting an emoji", () => {
        const activity = presenceActivity(
            {
                showPath: `/shows/${"x".repeat(125)}🎺🎺.dots`,
                isNewShowDraft: false,
            },
            started,
            t,
            true,
        );
        expect(activity.state?.isWellFormed()).toBe(true);
        expect(activity.state?.endsWith("🎺…")).toBe(true);
    });

    it("cuts a long show name to Discord's 128 characters and skips a one-letter one", () => {
        const long = presenceActivity(
            {
                showPath: `/shows/${"x".repeat(200)}.dots`,
                isNewShowDraft: false,
            },
            started,
            t,
            true,
        );
        expect(long.state).toHaveLength(128);
        const short = presenceActivity(
            { showPath: "/shows/A.dots", isNewShowDraft: false },
            started,
            t,
            true,
        );
        expect(short.state).toBeUndefined();
    });

    it("never names a new show's draft file", () => {
        const activity = presenceActivity(
            {
                showPath: "/data/new-show-drafts/abc.dots",
                isNewShowDraft: true,
            },
            started,
            t,
            true,
        );
        expect(JSON.stringify(activity)).not.toContain("abc");
    });

    it("says a new show is being started", () => {
        const activity = presenceActivity(
            {
                showPath: "/data/new-show-drafts/abc.dots",
                isNewShowDraft: true,
            },
            started,
            t,
        );
        expect(activity.details).toBe("<discord.presence.newShow>");
        expect(JSON.stringify(activity)).not.toContain("abc");
    });
});

/** A stand-in for the Discord app's socket, speaking the real protocol */
function fakeDiscord(path: string, { refuse = false } = {}) {
    const frames: DiscordFrame[] = [];
    const sockets: Socket[] = [];
    const server: Server = createServer((socket) => {
        sockets.push(socket);
        const decode = createFrameDecoder();
        socket.on("data", (chunk) => {
            for (const frame of decode(chunk)) {
                frames.push(frame);
                if (frame.op === OP_HANDSHAKE)
                    socket.write(
                        refuse
                            ? encodeFrame(OP_CLOSE, {
                                  code: 4000,
                                  message: "Invalid Client ID",
                              })
                            : encodeFrame(OP_FRAME, {
                                  cmd: "DISPATCH",
                                  evt: "READY",
                              }),
                    );
            }
        });
    });
    return {
        frames,
        listen: () =>
            new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(path, resolve);
            }),
        /** Discord quits */
        quit: () =>
            new Promise<void>((resolve) => {
                for (const socket of sockets) socket.destroy();
                server.close(() => resolve());
            }),
        ping: () => sockets.at(-1)?.write(encodeFrame(OP_PING, { n: 7 })),
    };
}

const until = async (check: () => boolean, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error("timed out");
        await new Promise((r) => setTimeout(r, 10));
    }
};

const activities = (frames: DiscordFrame[]) =>
    frames
        .filter((f) => f.op === OP_FRAME)
        .map(
            (f) =>
                (f.data as { args: { activity?: { details?: string } } }).args
                    .activity ?? null,
        );

// Unix sockets; the Windows named-pipe path is the same code with another address
describe.skipIf(process.platform === "win32")(
    "against a Discord socket",
    () => {
        let dir = "";
        const cleanups: (() => Promise<void> | void)[] = [];
        afterEach(async () => {
            for (const cleanup of cleanups.splice(0)) await cleanup();
            if (dir) rmSync(dir, { recursive: true, force: true });
            dir = "";
        });
        const socketPath = (n = 0) => {
            dir ||= mkdtempSync(join(tmpdir(), "om-discord-"));
            return join(dir, `discord-ipc-${n}`);
        };

        it("skips paths where nothing listens, handshakes, sets the status and answers pings", async () => {
            const discord = fakeDiscord(socketPath(1));
            await discord.listen();
            cleanups.push(discord.quit);

            const connection = await connectDiscordIpc({
                clientId: "123",
                paths: [socketPath(0), socketPath(1)],
                pid: 42,
            });
            cleanups.push(() => connection.close());
            expect(discord.frames[0]).toEqual({
                op: OP_HANDSHAKE,
                data: { v: 1, client_id: "123" },
            });

            connection.setActivity({ type: 0, details: "Designing" });
            connection.setActivity(null);
            discord.ping();
            await until(() => discord.frames.length >= 4);
            const [set, clear] = discord.frames.slice(1, 3);
            expect(set.data).toMatchObject({
                cmd: "SET_ACTIVITY",
                args: { pid: 42, activity: { details: "Designing" } },
            });
            expect(clear.data).toMatchObject({ args: { pid: 42 } });
            expect((clear.data as { args: object }).args).not.toHaveProperty(
                "activity",
            );
            expect(discord.frames[3]).toEqual({ op: OP_PONG, data: { n: 7 } });
        });

        it("rejects when Discord refuses the client id", async () => {
            const discord = fakeDiscord(socketPath(), { refuse: true });
            await discord.listen();
            cleanups.push(discord.quit);
            await expect(
                connectDiscordIpc({
                    clientId: "bad",
                    paths: [socketPath()],
                    pid: 1,
                }),
            ).rejects.toThrow(/Invalid Client ID/);
        });

        it("adds and removes the show's name when its switch flips", async () => {
            const path = socketPath();
            const discord = fakeDiscord(path);
            await discord.listen();
            cleanups.push(discord.quit);
            let showName = false;
            const presence = createDiscordPresence({
                clientId: "123",
                connect: () =>
                    connectDiscordIpc({
                        clientId: "123",
                        paths: [path],
                        pid: 1,
                    }),
                isEnabled: () => true,
                showsShowName: () => showName,
                t,
                retryMs: 20,
            });
            cleanups.push(() => presence.stop());

            presence.setScreen({
                showPath: "/s/Fall Show.dots",
                isNewShowDraft: false,
            });
            await until(() => activities(discord.frames).length === 1);
            expect(activities(discord.frames)[0]).not.toHaveProperty("state");

            showName = true;
            presence.refresh();
            await until(() => activities(discord.frames).length === 2);
            expect(activities(discord.frames)[1]).toMatchObject({
                details: "<discord.presence.designing>",
                state: "Fall Show",
            });

            showName = false;
            presence.refresh();
            await until(() => activities(discord.frames).length === 3);
            expect(activities(discord.frames)[2]).not.toHaveProperty("state");
        });

        it("waits for Discord, follows settings and the open show, and reconnects after Discord restarts", async () => {
            const path = socketPath();
            let enabled = true;
            const presence = createDiscordPresence({
                clientId: "123",
                connect: () =>
                    connectDiscordIpc({
                        clientId: "123",
                        paths: [path],
                        pid: 1,
                    }),
                isEnabled: () => enabled,
                t,
                retryMs: 20,
            });
            cleanups.push(() => presence.stop());

            // Discord isn't running yet
            presence.setScreen({
                showPath: "/s/Show.dots",
                isNewShowDraft: false,
            });
            await new Promise((r) => setTimeout(r, 50));

            let discord = fakeDiscord(path);
            await discord.listen();
            await until(() => activities(discord.frames).length === 1);
            expect(activities(discord.frames)[0]).toMatchObject({
                details: "<discord.presence.designing>",
            });
            expect(activities(discord.frames)[0]).not.toHaveProperty("state");

            // The show closes
            presence.setScreen({ showPath: "", isNewShowDraft: false });
            await until(() => activities(discord.frames).length === 2);
            expect(activities(discord.frames)[1]).toMatchObject({
                details: "<discord.presence.launchPage>",
            });

            // Discord quits and comes back
            await discord.quit();
            discord = fakeDiscord(path);
            await discord.listen();
            cleanups.push(() => discord.quit());
            await until(() => activities(discord.frames).length === 1);
            expect(activities(discord.frames)[0]).toMatchObject({
                details: "<discord.presence.launchPage>",
            });

            // Turned off: the connection closes, and Discord clears the status
            enabled = false;
            presence.refresh();
            presence.setScreen({
                showPath: "/s/b.dots",
                isNewShowDraft: false,
            });
            await new Promise((r) => setTimeout(r, 80));
            expect(activities(discord.frames)).toHaveLength(1);
        });

        it("does nothing without a client id", async () => {
            let connects = 0;
            const presence = createDiscordPresence({
                clientId: "",
                connect: () => {
                    connects++;
                    return Promise.reject(new Error("unreachable"));
                },
                isEnabled: () => true,
                t,
                retryMs: 5,
            });
            presence.setScreen({
                showPath: "/s/a.dots",
                isNewShowDraft: false,
            });
            await new Promise((r) => setTimeout(r, 30));
            expect(connects).toBe(0);
        });
    },
);
