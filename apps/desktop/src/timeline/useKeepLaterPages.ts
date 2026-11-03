import { useMemo } from "react";
import type { Resolver } from "@openmarch/core";
import {
    pageKeepStates,
    type MarcherNameOf,
    type PageKeepState,
} from "./timelineKeepLater";
import { pageFlags, type FlagPage } from "./timelinePlayhead";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";

type NamedPage = FlagPage & { readonly name: string };

/** Every page as `pageKeepStates` takes it, in show order. */
export const keepPagesOf = (pages: readonly NamedPage[]) =>
    pageFlags(pages).map((f) => ({
        id: f.page.id,
        name: f.page.name,
        flag: f.flag,
        range: f.range,
    }));

/** What `sharedPageKeepStates` computes from */
interface KeepStatesInput {
    resolver: Resolver;
    /** The resolver's version: a new one means new spans */
    version: number;
    pages: readonly NamedPage[];
    marcherIds: readonly number[];
}

/** The last few results, by input (the panel and the inspector usually ask the same) */
const keepStatesCache: {
    resolver: Resolver;
    version: number;
    pagesKey: string;
    idsKey: string;
    states: PageKeepState[];
}[] = [];
const CACHE_SIZE = 4;
let keepStatesComputed = 0;

/**
 * The selection's keep state on every page box (`pageKeepStates`), computed once per resolver
 * version, selection and pages however many callers ask (the timeline panel and the inspector
 * line; pre-merge review): later asks with equal inputs, even as other arrays, get the same
 * result.
 */
export function sharedPageKeepStates({
    resolver,
    version,
    pages,
    marcherIds,
}: KeepStatesInput): PageKeepState[] {
    if (marcherIds.length === 0) return [];
    const keepPages = keepPagesOf(pages);
    const pagesKey = JSON.stringify(keepPages);
    const idsKey = [...new Set(marcherIds)].sort((a, b) => a - b).join(",");
    const hit = keepStatesCache.find(
        (c) =>
            c.resolver === resolver &&
            c.version === version &&
            c.pagesKey === pagesKey &&
            c.idsKey === idsKey,
    );
    if (hit) return hit.states;
    keepStatesComputed++;
    const states = pageKeepStates({
        pages: keepPages,
        marcherIds,
        spansOf: (id) => resolverSpans(resolver, id),
    });
    keepStatesCache.unshift({
        resolver,
        version,
        pagesKey,
        idsKey,
        states,
    });
    keepStatesCache.length = Math.min(keepStatesCache.length, CACHE_SIZE);
    return states;
}

/** How many times `sharedPageKeepStates` computed rather than reused, for tests */
export const keepStatesComputations = () => keepStatesComputed;

/**
 * The selection's keep state on every page box (`sharedPageKeepStates`), from the resolver's
 * spans. Empty without a selection or a resolver.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function usePageKeepStates(
    pages: readonly NamedPage[],
    marcherIds: readonly number[],
): PageKeepState[] {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    return useMemo(() => {
        if (!resolver || marcherIds.length === 0) return [];
        return sharedPageKeepStates({
            resolver,
            version,
            pages,
            marcherIds,
        });
    }, [resolver, version, pages, marcherIds]);
}

/**
 * The selected marchers' names (drill numbers) for the keep words, stable while the names are.
 */
export function useMarcherNameOf(
    marchers:
        | readonly { readonly id: number; readonly drill_number: string }[]
        | undefined,
): MarcherNameOf {
    const key = (marchers ?? [])
        .map((m) => `${m.id}\u0000${m.drill_number}`)
        .join("\u0001");
    return useMemo(() => {
        const names = new Map<number, string>(
            key === ""
                ? []
                : key.split("\u0001").map((entry) => {
                      const [id, name] = entry.split("\u0000");
                      return [Number(id), name!];
                  }),
        );
        return (id: number) => names.get(id);
    }, [key]);
}
