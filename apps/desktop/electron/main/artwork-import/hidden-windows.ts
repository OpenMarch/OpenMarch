/**
 * Bookkeeping for the PDF renderer's hidden windows (C1.9 Q56), kept free
 * of Electron so it can be tested with stand-in windows.
 *
 * Hidden windows count as windows to Electron: while one is alive,
 * `window-all-closed` doesn't fire, so closing the editor mid-import would
 * leave a windowless app running on Windows and Linux. The renderer
 * therefore destroys every hidden window as soon as only hidden windows
 * remain (see `electron-pdf-renderer.ts`), which lets `window-all-closed`
 * fire as usual.
 */

/** The part of a BrowserWindow the registry uses. */
export interface HiddenWindowLike {
    isDestroyed(): boolean;
    destroy(): void;
}

export class HiddenWindowRegistry<W extends HiddenWindowLike> {
    private readonly live = new Set<W>();

    add(win: W): void {
        if (!win.isDestroyed()) this.live.add(win);
    }

    /** Forgets a window, for its `closed` event. */
    remove(win: W): void {
        this.live.delete(win);
    }

    has(win: W): boolean {
        return this.live.has(win);
    }

    /** Hidden windows still alive. */
    get size(): number {
        for (const win of this.live) {
            if (win.isDestroyed()) this.live.delete(win);
        }
        return this.live.size;
    }

    /** Destroys every hidden window now. Returns how many it destroyed. */
    destroyAll(): number {
        const wins = [...this.live];
        this.live.clear();
        let destroyed = 0;
        for (const win of wins) {
            if (win.isDestroyed()) continue;
            win.destroy();
            destroyed++;
        }
        return destroyed;
    }

    /**
     * True when hidden windows are alive and every other window in `all`
     * (the app's windows, such as `BrowserWindow.getAllWindows()`) is gone.
     */
    onlyHiddenRemain(all: readonly W[]): boolean {
        return (
            this.size > 0 &&
            all.every((win) => win.isDestroyed() || this.live.has(win))
        );
    }

    /** Destroys the hidden windows if they're all that's left. */
    closeIfOrphaned(all: readonly W[]): number {
        return this.onlyHiddenRemain(all) ? this.destroyAll() : 0;
    }
}
