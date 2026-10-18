import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import { useQuery } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import { describeDbTests } from "@/test/base";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { allMarchersQueryOptions } from "@/hooks/queries";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { defaultSettings } from "@/stores/UiSettingsStore";
import MarcherEditor from "../MarcherEditor";

/**
 * Selects the second page, then offers a button that selects the first `count` marchers.
 * Selecting from a click rather than an effect avoids racing the provider's own effect
 * that re-syncs the selection when the marchers load.
 */
function SelectMarchers({ count }: { count: number }) {
    const { pages } = useTimingObjects();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    useEffect(() => {
        if (!selectedPage && pages.length > 1) setSelectedPage(pages[1]);
    }, [pages, selectedPage, setSelectedPage]);
    if (!selectedPage || !marchers?.length) return null;
    return (
        <button onClick={() => setSelectedMarchers(marchers.slice(0, count))}>
            select test marchers
        </button>
    );
}

beforeEach(() => {
    // jsdom lacks ResizeObserver, which the Radix collapsible needs.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    // The multi-marcher rotation input listens to the app's canvas
    vi.stubGlobal(
        "canvas",
        new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties:
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            uiSettings: defaultSettings,
        }),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describeDbTests("MarcherEditor", (it) => {
    it.for([1, 2])(
        "offers placing %i selected marcher(s) at the previous or next page positions",
        async (count, { wrapper, db, marchersAndPages }) => {
            render(
                <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                    <SelectMarchers count={count} />
                    <MarcherEditor />
                </TolgeeProvider>,
                { wrapper },
            );

            fireEvent.click(
                await screen.findByRole(
                    "button",
                    { name: "select test marchers" },
                    { timeout: 5000 },
                ),
            );

            expect(
                await screen.findByRole(
                    "button",
                    { name: /place selected marchers/i },
                    { timeout: 5000 },
                ),
            ).toBeDefined();
        },
    );
});
