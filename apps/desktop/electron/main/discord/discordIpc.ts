/**
 * A minimal client for the Discord app's local IPC socket, enough to set the person's status
 * (Rich Presence). See https://docs.discord.com/developers/topics/rpc ("IPC transport").
 *
 * Every message is a frame: a little-endian int32 opcode, a little-endian int32 byte length,
 * then that many bytes of UTF-8 JSON. The app sends HANDSHAKE with its client id, Discord
 * answers READY, and from then on commands go as FRAME. Discord clears the status when the
 * socket closes, so quitting OpenMarch needs no clean-up message.
 */
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const OP_HANDSHAKE = 0;
export const OP_FRAME = 1;
export const OP_CLOSE = 2;
export const OP_PING = 3;
export const OP_PONG = 4;

const HEADER_BYTES = 8;
/** Discord's frames are small; anything bigger is a broken stream, not a message */
const MAX_FRAME_BYTES = 64 * 1024;

export interface DiscordFrame {
    op: number;
    data: unknown;
}

/** The status Discord shows under the person's name. Only the fields OpenMarch sets. */
export interface DiscordActivity {
    /** "Playing" */
    type: 0;
    /** First line under the app name */
    details?: string;
    /** Second line */
    state?: string;
    /** Shows "00:12 elapsed" from this time, in milliseconds since the epoch */
    timestamps?: { start?: number };
    assets?: { large_image?: string; large_text?: string };
    /** Shown to other people, not to the person themselves; at most two */
    buttons?: { label: string; url: string }[];
}

export function encodeFrame(op: number, data: unknown): Buffer {
    const json = Buffer.from(JSON.stringify(data), "utf8");
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    return Buffer.concat([header, json]);
}

/**
 * Collects socket chunks into whole frames: a frame can arrive split across chunks, or
 * several in one chunk. Throws on a frame that can't be one of Discord's.
 */
export function createFrameDecoder(): (chunk: Buffer) => DiscordFrame[] {
    let pending = Buffer.alloc(0);
    return (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        const frames: DiscordFrame[] = [];
        while (pending.length >= HEADER_BYTES) {
            const op = pending.readInt32LE(0);
            const length = pending.readInt32LE(4);
            if (length < 0 || length > MAX_FRAME_BYTES)
                throw new Error(`Discord IPC: bad frame length ${length}`);
            if (pending.length < HEADER_BYTES + length) break;
            const body = pending.subarray(HEADER_BYTES, HEADER_BYTES + length);
            pending = pending.subarray(HEADER_BYTES + length);
            frames.push({ op, data: JSON.parse(body.toString("utf8")) });
        }
        return frames;
    };
}

/**
 * Where the Discord app may be listening, in the order to try. Discord numbers its sockets
 * 0–9 (one per running Discord: stable, PTB, Canary). On Linux, the Flatpak and Snap builds
 * keep theirs in their own folders under the runtime directory.
 */
export function discordIpcPaths(
    platform: NodeJS.Platform,
    env: NodeJS.ProcessEnv,
): string[] {
    const numbers = Array.from({ length: 10 }, (_, n) => n);
    if (platform === "win32")
        return numbers.map((n) => `\\\\?\\pipe\\discord-ipc-${n}`);
    const base =
        (
            env.XDG_RUNTIME_DIR ||
            env.TMPDIR ||
            env.TMP ||
            env.TEMP ||
            "/tmp"
        ).replace(/\/+$/, "") || "/";
    const folders =
        platform === "linux"
            ? [
                  base,
                  join(base, "app", "com.discordapp.Discord"),
                  join(base, "snap.discord"),
              ]
            : [base];
    return folders.flatMap((folder) =>
        numbers.map((n) => join(folder, `discord-ipc-${n}`)),
    );
}

export interface DiscordIpcConnection {
    /** Sets the status, or clears it with `null` */
    setActivity(activity: DiscordActivity | null): void;
    close(): void;
    /** Runs once when the socket closes, from either side (Discord quit, `close()`) */
    onClose(listener: () => void): void;
}

export interface ConnectOptions {
    clientId: string;
    paths: string[];
    /** The process the status belongs to; Discord drops the status when it exits */
    pid: number;
    /** Per path, how long to wait for READY */
    timeoutMs?: number;
    connect?: (path: string) => Socket;
}

/** Connects to the first path where Discord answers the handshake. Rejects if none does. */
export async function connectDiscordIpc(
    options: ConnectOptions,
): Promise<DiscordIpcConnection> {
    let lastError: unknown = new Error("Discord IPC: no paths to try");
    for (const path of options.paths) {
        try {
            return await connectAt(path, options);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

type FrameReading =
    | { kind: "ping" }
    | { kind: "closed"; message: string }
    | { kind: "ready" }
    | { kind: "error"; message: string }
    | { kind: "other" };

/** What a frame from Discord asks of the client */
function readFrame(frame: DiscordFrame): FrameReading {
    const data = frame.data as {
        evt?: string;
        message?: string;
        data?: { message?: string };
    } | null;
    if (frame.op === OP_PING) return { kind: "ping" };
    // e.g. an unknown client id
    if (frame.op === OP_CLOSE)
        return { kind: "closed", message: data?.message ?? "no reason" };
    if (frame.op !== OP_FRAME) return { kind: "other" };
    if (data?.evt === "READY") return { kind: "ready" };
    if (data?.evt === "ERROR")
        return {
            kind: "error",
            message: data.data?.message ?? JSON.stringify(data),
        };
    return { kind: "other" };
}

function connectAt(
    path: string,
    {
        clientId,
        pid,
        timeoutMs = 3000,
        connect = (p: string) => createConnection(p),
    }: ConnectOptions,
): Promise<DiscordIpcConnection> {
    return new Promise((resolve, reject) => {
        const socket = connect(path);
        const decode = createFrameDecoder();
        const closeListeners: (() => void)[] = [];
        let ready = false;
        let closed = false;

        const fail = (error: Error) => {
            clearTimeout(timer);
            socket.destroy();
            if (!ready) reject(error);
        };
        const timer = setTimeout(
            () => fail(new Error(`Discord IPC: no answer at ${path}`)),
            timeoutMs,
        );

        const connection: DiscordIpcConnection = {
            setActivity(activity) {
                if (socket.destroyed) return;
                socket.write(
                    encodeFrame(OP_FRAME, {
                        cmd: "SET_ACTIVITY",
                        args: activity ? { pid, activity } : { pid },
                        nonce: randomUUID(),
                    }),
                );
            },
            close() {
                // Discord clears the status when the socket goes away
                socket.destroy();
            },
            onClose(listener) {
                if (closed) listener();
                else closeListeners.push(listener);
            },
        };

        socket.on("connect", () => {
            socket.write(
                encodeFrame(OP_HANDSHAKE, { v: 1, client_id: clientId }),
            );
        });
        socket.on("data", (chunk: Buffer) => {
            let frames: DiscordFrame[];
            try {
                frames = decode(chunk);
            } catch (error) {
                fail(error as Error);
                return;
            }
            for (const frame of frames) {
                const reply = readFrame(frame);
                if (reply.kind === "ping")
                    socket.write(encodeFrame(OP_PONG, frame.data));
                else if (reply.kind === "closed")
                    fail(new Error(`Discord IPC closed: ${reply.message}`));
                else if (reply.kind === "ready" && !ready) {
                    ready = true;
                    clearTimeout(timer);
                    resolve(connection);
                } else if (reply.kind === "error")
                    console.warn("Discord status not set:", reply.message);
            }
        });
        socket.on("error", (error) => fail(error));
        socket.on("close", () => {
            clearTimeout(timer);
            if (!ready) reject(new Error(`Discord IPC: closed at ${path}`));
            if (closed) return;
            closed = true;
            for (const listener of closeListeners) listener();
        });
    });
}
