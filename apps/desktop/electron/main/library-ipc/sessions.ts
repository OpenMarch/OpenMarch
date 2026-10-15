/**
 * Import sessions (C1.9 §4, §8; owner decision Q47). The renderer only
 * ever holds random session and file ids: a path enters main through the
 * pick dialog alone and stays in this map. Bytes are read once, at the
 * first inspect, and kept, so a commit stores exactly the bytes that were
 * reviewed. One session per editor; a session ends on `import-close`, a new
 * pick, the editor reloading or closing, or 30 minutes idle.
 */
import { randomUUID } from "node:crypto";
import type {
    ImportFileType,
    ImportSession,
    PickContext,
} from "../../../src/view3d/library/protocol";
import type { ArtworkInspection } from "../artwork-import";
import type { ModelFileInput, ModelImportResult } from "../model-import/types";

export interface SessionFile {
    readonly fileId: string;
    /** Absolute; never leaves main. */
    readonly path: string;
    readonly filename: string;
    readonly sizeBytes: number;
    readonly type: ImportFileType;
    readonly tooLarge: boolean;
    /** Read at the first inspect, then reused. */
    model?: ModelFileInput;
    artwork?: Uint8Array;
    artworkInspection?: ArtworkInspection;
    /** Numbers this file's model inspects. */
    inspectSeq: number;
    /** The newest finished inspect: its result and the choices it ran with. */
    lastResult?: { seq: number; key: string; result: ModelImportResult };
    previews: Map<string, Uint8Array>;
}

export interface Session {
    readonly sessionId: string;
    readonly senderId: number;
    readonly context: PickContext | null;
    readonly files: Map<string, SessionFile>;
    lastUsed: number;
    /** Set while an artwork inspect or commit runs. */
    artworkJob: AbortController | null;
    /** Bumped by `import-cancel`, so a model job that hadn't reached the worker yet stops too. */
    cancelSeq: number;
    closed: boolean;
}

export type SessionLookup =
    | { ok: true; session: Session; file?: SessionFile }
    | { ok: false; code: "session-expired" | "unknown-file" };

export interface NewSessionFile {
    path: string;
    filename: string;
    sizeBytes: number;
    type: ImportFileType;
    tooLarge: boolean;
}

export class ImportSessionRegistry {
    private readonly sessions = new Map<string, Session>();

    constructor(
        private readonly options: {
            idleMs: number;
            now?: () => number;
            /** Called for every session that ends, to cancel its jobs. */
            onClose?: (session: Session) => void;
        },
    ) {}

    private now() {
        return this.options.now?.() ?? Date.now();
    }

    /** Opens a session for `senderId`, closing its previous one. */
    open(
        senderId: number,
        files: readonly NewSessionFile[],
        context: PickContext | null,
    ): Session {
        this.closeSender(senderId);
        const session: Session = {
            sessionId: randomUUID(),
            senderId,
            context,
            files: new Map(),
            lastUsed: this.now(),
            artworkJob: null,
            cancelSeq: 0,
            closed: false,
        };
        for (const file of files) {
            const fileId = randomUUID();
            session.files.set(fileId, {
                ...file,
                fileId,
                inspectSeq: 0,
                previews: new Map(),
            });
        }
        this.sessions.set(session.sessionId, session);
        return session;
    }

    /**
     * The sender's live session, and the file if `fileId` is given. Unknown,
     * foreign and expired ids are refused alike; a hit counts as use.
     */
    get(senderId: number, sessionId: string, fileId?: string): SessionLookup {
        const session = this.sessions.get(sessionId);
        if (!session || session.senderId !== senderId) {
            return { ok: false, code: "session-expired" };
        }
        if (this.isExpired(session)) {
            this.close(session);
            return { ok: false, code: "session-expired" };
        }
        session.lastUsed = this.now();
        if (fileId === undefined) return { ok: true, session };
        const file = session.files.get(fileId);
        if (!file) return { ok: false, code: "unknown-file" };
        return { ok: true, session, file };
    }

    /** Marks a session as used, so a long job doesn't let it expire. */
    touch(session: Session) {
        session.lastUsed = this.now();
    }

    closeById(senderId: number, sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session || session.senderId !== senderId) return false;
        this.close(session);
        return true;
    }

    closeSender(senderId: number) {
        for (const session of [...this.sessions.values()]) {
            if (session.senderId === senderId) this.close(session);
        }
    }

    closeAll() {
        for (const session of [...this.sessions.values()]) this.close(session);
    }

    /** Drops idle sessions; run on a timer. */
    sweep() {
        for (const session of [...this.sessions.values()]) {
            if (this.isExpired(session)) this.close(session);
        }
    }

    get size(): number {
        return this.sessions.size;
    }

    private isExpired(session: Session) {
        return this.now() - session.lastUsed > this.options.idleMs;
    }

    private close(session: Session) {
        if (session.closed) return;
        session.closed = true;
        this.sessions.delete(session.sessionId);
        session.artworkJob?.abort();
        this.options.onClose?.(session);
        // Free the bytes even if a job still holds the session object.
        for (const file of session.files.values()) {
            file.model = undefined;
            file.artwork = undefined;
            file.lastResult = undefined;
            file.previews.clear();
        }
    }
}

/** The renderer's view of a session: ids, file names and sizes, never paths. */
export function sessionDto(session: Session): ImportSession {
    return {
        sessionId: session.sessionId,
        context: session.context,
        files: [...session.files.values()].map((f) => ({
            fileId: f.fileId,
            filename: f.filename,
            sizeBytes: f.sizeBytes,
            type: f.type,
            tooLarge: f.tooLarge,
        })),
    };
}
