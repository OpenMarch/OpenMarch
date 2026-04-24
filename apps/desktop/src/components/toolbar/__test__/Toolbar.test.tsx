import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Toolbar from "../Toolbar";
import { FIRST_PAGE_ID } from "@/db-functions";
import type Page from "@/global/classes/Page";

vi.mock("@/components/workspace/editor/EditorToolbar", () => ({
    default: () => <div>EditorToolbar</div>,
}));
vi.mock("@/components/workspace/lightDesigner/LightDesignerToolbar", () => ({
    default: () => <div>LightDesignerToolbar</div>,
}));

const mockSetMode = vi.fn();
vi.mock("@/stores/WorkspaceViewStore", () => ({
    useWorkspaceViewStore: {
        use: {
            mode: () => "editor",
            setMode: () => mockSetMode,
        },
    },
}));

const mockSetSelectedPage = vi.fn();
const mockSelectedPageState = {
    selectedPage: { id: 30 },
    setSelectedPage: mockSetSelectedPage,
};
vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => mockSelectedPageState,
}));

const mockPages: Pick<Page, "id">[] = [
    { id: FIRST_PAGE_ID } as Page,
    { id: 20 } as Page,
    { id: 30 } as Page,
];
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({
        pages: mockPages,
    }),
}));

const mockScenes = [
    { id: 1, start_page_id: FIRST_PAGE_ID },
    { id: 2, start_page_id: 30 },
];
vi.mock("@tanstack/react-query", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@tanstack/react-query")>();
    return {
        ...actual,
        useQuery: () => ({ data: mockScenes }),
    };
});
vi.mock("@/hooks/queries", () => ({
    allLightingScenesQueryOptions: () => ({}),
}));

describe("Toolbar", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSelectedPageState.selectedPage = { id: 30 };
    });

    it("selects page before scene start when switching to light designer", () => {
        render(<Toolbar />);
        fireEvent.click(screen.getByRole("radio", { name: "Light Designer" }));

        expect(mockSetSelectedPage).toHaveBeenCalledWith({ id: 20 });
        expect(mockSetMode).toHaveBeenCalledWith("lightDesigner");
    });

    it("selects FIRST_PAGE_ID when scene starts on first page", () => {
        mockSelectedPageState.selectedPage = { id: FIRST_PAGE_ID };

        render(<Toolbar />);
        fireEvent.click(screen.getByRole("radio", { name: "Light Designer" }));

        expect(mockSetSelectedPage).toHaveBeenCalledWith({
            id: FIRST_PAGE_ID,
        });
        expect(mockSetMode).toHaveBeenCalledWith("lightDesigner");
    });
});
