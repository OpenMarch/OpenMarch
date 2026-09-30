import type { Resolver, TimelineSnapshot } from "../src/timeline/types";

export function directChain(n: number): TimelineSnapshot;
export function ftlChain(k: number): TimelineSnapshot;
export function runDeepChains(
    createResolver: (host: TimelineSnapshot) => Resolver,
    N?: number,
): Array<{ ok: boolean; message: string }>;
