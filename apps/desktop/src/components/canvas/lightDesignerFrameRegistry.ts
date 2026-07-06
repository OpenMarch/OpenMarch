export type LightDesignerAfterMarchersFn = (timeMs: number) => void;

let handler: LightDesignerAfterMarchersFn | null = null;
const subscribers = new Set<LightDesignerAfterMarchersFn>();

/** Registered by Light Designer canvas appearance; invoked from the playback rAF after coordinates update. */
export const lightDesignerFrameRegistry = {
    set(fn: LightDesignerAfterMarchersFn | null): void {
        handler = fn;
    },
    subscribe(fn: LightDesignerAfterMarchersFn): () => void {
        subscribers.add(fn);
        return () => {
            subscribers.delete(fn);
        };
    },
    run(timeMs: number): void {
        handler?.(timeMs);
        for (const subscriber of subscribers) {
            subscriber(timeMs);
        }
    },
};
