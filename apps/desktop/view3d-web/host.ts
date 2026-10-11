/**
 * TEMPORARY: the web preview of the 3D View. Delete `view3d-web/` (and its
 * `view3d-web:*` scripts in package.json) before the 3D View goes to
 * `OpenMarch/OpenMarch`. See README.md.
 *
 * Stands in for the Electron side of the 3D View window: `window.view3d`
 * reads a `.dots` file held in memory by sql.js, and this host plays the
 * editor's part, owning the clock, the selected page and the music. The
 * window code in `src/view3d` runs unchanged.
 */
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import journal from "../electron/database/migrations/meta/_journal.json";
import {
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    wallNowMs,
    showTimeAt,
    type View3dClock,
    type View3dPayloads,
    type View3dPlaybackAction,
    type View3dPublishChannel,
} from "@/view3d/sync/protocol";
import { parseVenueSettings } from "@/view3d/core/venueSettings";

const migrationSql = import.meta.glob<string>(
    "../electron/database/migrations/*.sql",
    { query: "?raw", import: "default", eager: true },
);

/** Same lead time the editor's audio player gives Web Audio. */
const PLAYBACK_DELAY_S = 0.1;

export interface HostPage {
    id: number;
    order: number;
    /** Where the page's movement ends: `timestamp + duration`, in ms. */
    endMs: number;
}

type Listener = (payload: unknown) => void;

let sqlPromise: Promise<SqlJsStatic> | null = null;
const loadSql = () =>
    (sqlPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl }));

/**
 * Applies the app's migrations the file hasn't had, as the app does when it
 * opens a show (Drizzle compares each journal entry's `when` with the
 * newest `created_at`). Only in memory; the file is never written back.
 */
function migrate(db: Database) {
    const result = db.exec("SELECT MAX(created_at) FROM __drizzle_migrations");
    const last = Number(result[0]?.values[0]?.[0] ?? 0);
    for (const entry of journal.entries) {
        if (entry.when <= last) continue;
        const sql =
            migrationSql[`../electron/database/migrations/${entry.tag}.sql`];
        if (!sql) throw new Error(`Missing migration ${entry.tag}`);
        for (const statement of sql.split("--> statement-breakpoint")) {
            if (statement.trim()) db.run(statement);
        }
        db.run(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
            [entry.tag, entry.when],
        );
    }
}

const toBindable = (value: unknown) =>
    value === undefined ? null : typeof value === "boolean" ? +value : value;

class WebHost {
    private db: Database | null = null;
    private listeners = new Map<View3dPublishChannel, Set<Listener>>();
    private pages: HostPage[] = [];
    private selectedPageId: number | null = null;
    private clock: View3dClock = {
        seq: 1,
        playing: false,
        anchorShowMs: 0,
        anchorWallMs: wallNowMs(),
        rate: 1,
    };
    private tick: number | null = null;
    private stateListeners = new Set<() => void>();

    // Music
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private audioSource: AudioBufferSourceNode | null = null;
    private gain: GainNode | null = null;
    private audioOffsetS = 0;
    muted = false;

    showName = "";

    /** Opens `bytes` as the show, replacing any show already open. */
    async open(bytes: Uint8Array, showName: string) {
        const SQL = await loadSql();
        const next = new SQL.Database(bytes);
        try {
            migrate(next);
        } catch (error) {
            next.close();
            throw error;
        }
        this.pause();
        this.db?.close();
        this.db = next;
        this.showName = showName;
        this.pages = [];
        this.selectedPageId = null;
        this.audioBuffer = null;
        void this.loadAudio();
        this.emit(VIEW3D_INVALIDATE_CHANNEL, { queryKeys: [[]] });
        this.notify();
    }

    get isOpen() {
        return this.db !== null;
    }

    get playing() {
        return this.clock.playing;
    }

    // ----- window.view3d -----

    readonly api: Window["view3d"] = {
        isMacOS: false,
        sqlRead: async (sql, params, method) => this.read(sql, params, method),
        hello: () => this.publish(),
        on: (channel, callback) => {
            const set = this.listeners.get(channel) ?? new Set();
            this.listeners.set(channel, set);
            const listener = callback as Listener;
            set.add(listener);
            return () => set.delete(listener);
        },
        requestVenueChange: (settings) => this.writeVenue(settings),
        requestPlayback: (action) => this.runPlayback(action),
    };

    private read(
        sql: string,
        params: unknown[],
        method: "all" | "run" | "get" | "values",
    ): { rows: any } {
        if (!this.db) throw new Error("No show is open");
        if (!/^\s*(select|with)\b/i.test(sql) || method === "run") {
            throw new Error("3D View: only SELECT or WITH statements");
        }
        const statement = this.db.prepare(sql);
        try {
            statement.bind(params.map(toBindable) as any[]);
            const rows: unknown[][] = [];
            while (statement.step()) {
                rows.push(statement.get());
                if (method === "get") break;
            }
            return { rows: method === "get" ? rows[0] : rows };
        } finally {
            statement.free();
        }
    }

    private writeVenue(settings: unknown) {
        if (!this.db) return;
        try {
            const json = JSON.stringify(parseVenueSettings(settings));
            this.db.run(
                `INSERT INTO view3d_venue (id, json_data) VALUES (1, ?)
                 ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data`,
                [json],
            );
            this.emit(VIEW3D_INVALIDATE_CHANNEL, {
                queryKeys: [["view3d_venue"]],
            });
        } catch (error) {
            console.error("Rejected venue settings", error);
        }
    }

    private emit<C extends View3dPublishChannel>(
        channel: C,
        payload: View3dPayloads[C],
    ) {
        this.listeners.get(channel)?.forEach((listener) => listener(payload));
    }

    private publish() {
        this.emit(VIEW3D_CLOCK_CHANNEL, this.clock);
        this.emit(VIEW3D_SELECTION_CHANNEL, {
            selectedPageId: this.selectedPageId,
            selectedMarcherIds: [],
        });
    }

    // ----- Playback, as the editor's actions and animation loop do it -----

    /** The window's pages, from its own timing query. */
    setPages(pages: HostPage[]) {
        this.pages = [...pages].sort((a, b) => a.order - b.order);
        if (!this.pages.some((page) => page.id === this.selectedPageId)) {
            this.pause();
            this.select(this.pages[0]?.id ?? null);
        }
    }

    setAudioOffset(seconds: number) {
        this.audioOffsetS = seconds;
    }

    subscribe(listener: () => void) {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    private notify() {
        this.stateListeners.forEach((listener) => listener());
    }

    private pageIndex() {
        return this.pages.findIndex((page) => page.id === this.selectedPageId);
    }

    private select(pageId: number | null) {
        this.selectedPageId = pageId;
        const page = this.pages.find((p) => p.id === pageId);
        this.setClock(false, page?.endMs ?? 0, wallNowMs());
        this.publish();
    }

    private setClock(
        playing: boolean,
        anchorShowMs: number,
        anchorWallMs: number,
    ) {
        this.clock = {
            seq: this.clock.seq + 1,
            playing,
            anchorShowMs,
            anchorWallMs,
            rate: 1,
        };
        this.notify();
    }

    runPlayback(action: View3dPlaybackAction) {
        const index = this.pageIndex();
        if (index < 0) return;
        const last = this.pages.length - 1;
        if (action === "playPause") {
            if (this.clock.playing) this.pause();
            else if (index < last) this.play();
            return;
        }
        if (this.clock.playing) return;
        const target = {
            previousPage: index - 1,
            nextPage: index + 1,
            firstPage: 0,
            lastPage: last,
        }[action];
        if (target >= 0 && target <= last && target !== index) {
            this.select(this.pages[target].id);
        }
    }

    private play() {
        const page = this.pages[this.pageIndex()];
        const startShowMs = page.endMs;
        const startWallMs = wallNowMs() + PLAYBACK_DELAY_S * 1000;
        this.startAudio(startShowMs / 1000);
        this.setClock(true, startShowMs, startWallMs);
        this.publish();
        this.tick = window.setInterval(() => this.followPage(), 30);
    }

    /** Stops playing and holds at the selected page's end, like the editor. */
    pause() {
        if (this.tick !== null) window.clearInterval(this.tick);
        this.tick = null;
        this.stopAudio();
        if (this.clock.playing) this.select(this.selectedPageId);
    }

    /** Selects the page being played, and stops after the last one. */
    private followPage() {
        const now = showTimeAt(this.clock, wallNowMs());
        const index = this.pages.findIndex(
            (page, i) =>
                i < this.pages.length - 1 &&
                now >= page.endMs &&
                now < this.pages[i + 1].endMs,
        );
        if (index < 0 && now >= this.pages[0].endMs) {
            // Past the last page: pause there.
            this.selectedPageId = this.pages[this.pages.length - 1].id;
            this.pause();
        } else if (index >= 0 && this.pages[index].id !== this.selectedPageId) {
            this.selectedPageId = this.pages[index].id;
            this.emit(VIEW3D_SELECTION_CHANNEL, {
                selectedPageId: this.selectedPageId,
                selectedMarcherIds: [],
            });
            this.notify();
        }
    }

    // ----- Music -----

    private async loadAudio() {
        const db = this.db;
        if (!db) return;
        const result = db.exec(
            "SELECT data FROM audio_files WHERE selected = 1 LIMIT 1",
        );
        const data = result[0]?.values[0]?.[0];
        if (!(data instanceof Uint8Array) || data.length === 0) return;
        this.audioContext ??= new AudioContext();
        try {
            const buffer = await this.audioContext.decodeAudioData(
                data.slice().buffer,
            );
            if (this.db === db) this.audioBuffer = buffer;
        } catch (error) {
            console.warn("Couldn't decode the show's music", error);
        }
        this.notify();
    }

    get hasAudio() {
        return this.audioBuffer !== null;
    }

    setMuted(muted: boolean) {
        this.muted = muted;
        if (this.gain) this.gain.gain.value = muted ? 0 : 1;
        this.notify();
    }

    /**
     * Starts the music at show time `showS`. A positive audio offset pads the
     * start with silence (as the editor's audio worker does), so the file's
     * time is the show time minus the offset.
     */
    private startAudio(showS: number) {
        const ctx = this.audioContext;
        if (!ctx || !this.audioBuffer) return;
        void ctx.resume();
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        this.gain = ctx.createGain();
        this.gain.gain.value = this.muted ? 0 : 1;
        source.connect(this.gain).connect(ctx.destination);
        const fileS = showS - this.audioOffsetS;
        const when = ctx.currentTime + PLAYBACK_DELAY_S;
        if (fileS >= 0) source.start(when, fileS);
        else source.start(when - fileS, 0);
        this.audioSource = source;
    }

    private stopAudio() {
        try {
            this.audioSource?.stop();
        } catch {
            // Already stopped.
        }
        this.audioSource = null;
    }
}

export const host = new WebHost();
