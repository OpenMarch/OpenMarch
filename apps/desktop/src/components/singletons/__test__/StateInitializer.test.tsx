import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import { FIRST_PAGE_ID } from "@/db-functions";
import { useSelectedPage } from "@/context/SelectedPageContext";
import StateInitializer from "../StateInitializer";

let selectedId: number | null | undefined;
function SelectedProbe() {
    selectedId = useSelectedPage()?.selectedPage?.id ?? null;
    return null;
}

const notFoundWarnings = (warn: ReturnType<typeof vi.spyOn>) =>
    warn.mock.calls.filter(([message]) =>
        String(message).includes("not found. Not setting selected page"),
    );

describeDbTests("StateInitializer", (it) => {
    afterEach(() => vi.restoreAllMocks());

    it("selects the first page on load without asking for a page the selection can't find", async ({
        wrapper: Wrapper,
        db,
    }) => {
        // The db fixture sets up window.electron's SQL proxy
        expect(db).toBeDefined();
        const warn = vi.spyOn(console, "warn");
        // The audio file comes over IPC, which the test bridge doesn't have; this test is about
        // pages, so it never answers
        const electron = window.electron as unknown as Record<string, unknown>;
        electron.getSelectedAudioFile = () => new Promise(() => {});
        // As in the app, the database reports ready over IPC, after the first render
        electron.databaseIsReady = async () => true;
        selectedId = undefined;
        render(
            <Wrapper>
                <StateInitializer />
                <SelectedProbe />
            </Wrapper>,
        );
        await waitFor(() => expect(selectedId).toBe(FIRST_PAGE_ID));
        expect(notFoundWarnings(warn)).toEqual([]);
    });

    it("a page asked for before the selection has loaded its pages is selected once they load", async ({
        wrapper: Wrapper,
        db,
    }) => {
        expect(db).toBeDefined();
        const warn = vi.spyOn(console, "warn");
        selectedId = undefined;
        // Asks once, on mount, while the provider's pages are still loading: StateInitializer's
        // own page list can load a commit before the provider's does
        function SelectEarly() {
            const setSelectedPage = useSelectedPage()!.setSelectedPage;
            useEffect(() => {
                setSelectedPage({ id: FIRST_PAGE_ID });
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, []);
            return null;
        }
        render(
            <Wrapper>
                <SelectEarly />
                <SelectedProbe />
            </Wrapper>,
        );
        await waitFor(() => expect(selectedId).toBe(FIRST_PAGE_ID));
        expect(notFoundWarnings(warn)).toEqual([]);
    });
});
