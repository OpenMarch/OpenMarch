/**
 * Size presets: custom sizes saved in the local Library beside the built-in
 * catalog (docs/3d/props-spec.md §2 "Local Library", ADR 0002 D-12). This is
 * the shape the Library saves; storing it is the Library's job.
 *
 * A preset has the same dimensions as a catalog entry of its kind, stored as
 * meters plus the text as typed, so a size typed in feet re-displays as typed.
 *
 * Plain TypeScript and zod only: this module lives under `view3d/core/`, so it
 * must not import React, React Three Fiber, drei, Electron or the database.
 */
import * as z from "zod";
import {
    catalogDims,
    type CatalogEntry,
    type DimsByKind,
    type SizeKind,
} from "./catalog";
import type { Length } from "./units";

export const SIZE_PRESET_VERSION = 1;

export const lengthSchema = z.object({
    m: z.number().finite().nonnegative(),
    typed: z.string().min(1).optional(),
});

const two = <A extends string, B extends string>(a: A, b: B) =>
    z.object({ [a]: lengthSchema, [b]: lengthSchema } as Record<
        A | B,
        typeof lengthSchema
    >);

const presetBase = {
    version: z.literal(SIZE_PRESET_VERSION),
    id: z.uuid(),
    name: z.string().trim().min(1),
    createdAt: z.iso.datetime(),
};

export const sizePresetSchema = z.discriminatedUnion("kind", [
    z.object({
        ...presetBase,
        kind: z.literal("pole"),
        dims: two("length", "diameter"),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("swingPole"),
        dims: two("length", "diameter"),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("tPole"),
        dims: z.object({
            upright: lengthSchema,
            crossbars: z.array(lengthSchema).min(1),
        }),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("silk"),
        dims: z
            .object({
                header: lengthSchema,
                fly: lengthSchema,
                depth: lengthSchema.optional(),
                sleeve: lengthSchema.optional(),
                sag: lengthSchema.optional(),
            })
            // A silk can't be shallower than its pole edge.
            .refine((d) => d.depth === undefined || d.depth.m >= d.header.m, {
                message: "depth must be at least the header",
                path: ["depth"],
            }),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("rifle"),
        dims: z.object({ length: lengthSchema }),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("sabre"),
        dims: z.object({ length: lengthSchema }),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("floor"),
        dims: two("width", "depth"),
    }),
    z.object({
        ...presetBase,
        kind: z.literal("flatProp"),
        dims: two("width", "height"),
    }),
]);

export type SizePreset = {
    [K in SizeKind]: {
        readonly version: typeof SIZE_PRESET_VERSION;
        readonly id: string;
        readonly kind: K;
        readonly name: string;
        /** ISO 8601. */
        readonly createdAt: string;
        readonly dims: DimsByKind<Length>[K];
    };
}[SizeKind];

export type SizePresetOf<K extends SizeKind> = Extract<SizePreset, { kind: K }>;

/** Validates a stored preset. Returns null for anything that isn't one. */
export function parseSizePreset(value: unknown): SizePreset | null {
    const result = sizePresetSchema.safeParse(value);
    return result.success ? (result.data as SizePreset) : null;
}

/** A new preset. The caller supplies the id and time, keeping this pure. */
export function makeSizePreset<K extends SizeKind>(
    kind: K,
    fields: {
        id: string;
        name: string;
        createdAt: string;
        dims: DimsByKind<Length>[K];
    },
): SizePresetOf<K> {
    return {
        version: SIZE_PRESET_VERSION,
        kind,
        id: fields.id,
        name: fields.name.trim(),
        createdAt: fields.createdAt,
        dims: fields.dims,
    } as SizePresetOf<K>;
}

/** A preset starting from a catalog size, for "save as preset" after an edit. */
export function presetFromCatalog(
    entry: CatalogEntry,
    fields: { id: string; name: string; createdAt: string },
): SizePreset {
    return makeSizePreset(entry.kind, {
        ...fields,
        dims: catalogDims(entry),
    });
}
