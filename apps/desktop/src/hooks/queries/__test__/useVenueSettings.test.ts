import { describe, expect, it } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import GridFieldTemplates from "@/global/classes/fieldTemplates/GridFields";
import {
    defaultVenueForKit,
    type VenueSettings,
} from "@/view3d/core/venueSettings";
import { _combineVenueSettings, venueSettingsKeys } from "../useVenueSettings";

const result = <T>(
    data: T | undefined,
    state: { isLoading?: boolean; isError?: boolean } = {},
) =>
    ({
        data,
        isLoading: state.isLoading ?? false,
        isError: state.isError ?? false,
    }) as UseQueryResult<T>;

const field = GridFieldTemplates.INDOOR_40x60_8to5;
const stored: VenueSettings = { ...defaultVenueForKit("pro"), crowd: false };

describe("useVenueSettings", () => {
    it("uses the table name as the key base, so undo invalidates it", () => {
        expect(venueSettingsKeys.all()).toEqual(["view3d_venue"]);
        expect(venueSettingsKeys.stored()[0]).toBe("view3d_venue");
    });

    it("returns the stored settings when there are some", () => {
        expect(
            _combineVenueSettings([
                result<VenueSettings | null>(stored),
                result<FieldProperties>(field),
            ]),
        ).toEqual({
            data: stored,
            isDefault: false,
            isLoading: false,
            hasError: false,
        });
    });

    it("returns the field's default when nothing is stored", () => {
        expect(
            _combineVenueSettings([
                result<VenueSettings | null>(null),
                result<FieldProperties>(field),
            ]),
        ).toEqual({
            data: defaultVenueForKit("gym"),
            isDefault: true,
            isLoading: false,
            hasError: false,
        });
    });

    it("returns no data while loading", () => {
        const combined = _combineVenueSettings([
            result<VenueSettings | null>(null),
            result<FieldProperties>(undefined, { isLoading: true }),
        ]);
        expect(combined.data).toBeUndefined();
        expect(combined.isLoading).toBe(true);
    });

    it("reports errors", () => {
        const combined = _combineVenueSettings([
            result<VenueSettings | null>(undefined, { isError: true }),
            result<FieldProperties>(field),
        ]);
        expect(combined.data).toBeUndefined();
        expect(combined.hasError).toBe(true);
    });
});
