import { cleanup, render } from "@testing-library/react";
import { describe, afterEach, it, beforeEach, vi, expect } from "vitest";
import Canvas from "../Canvas";
import * as Mocks from "@/__mocks__/globalMocks";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { ElectronApi } from "electron/preload";
import { falsyUiSettings } from "./MocksForCanvas";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

// import { mockMarchers, mockPages } from "@/__mocks__/globalMocks";
// import { createMarcherPages } from "@/utilities/TestingUtilities";

// const initialMockMarcherPages = createMarcherPages(mockMarchers, mockPages);

describe("Canvas", () => {
    const renderWithContext = (canvas: OpenMarchCanvas) => {
        render(
            <IsPlayingProvider>
                <SelectedPageProvider>
                    <SelectedMarchersProvider>
                        <SelectedAudioFileProvider>
                            <FieldPropertiesProvider>
                                <Canvas testCanvas={canvas} />
                            </FieldPropertiesProvider>
                        </SelectedAudioFileProvider>
                    </SelectedMarchersProvider>
                </SelectedPageProvider>
            </IsPlayingProvider>,
        );
    };

    beforeEach(() => {
        window.electron = {
            getFieldProperties: vi
                .fn()
                .mockResolvedValue(Mocks.mockNCAAFieldProperties),
            sendSelectedMarchers: vi.fn(),
            getMarchers: vi.fn().mockResolvedValue(Mocks.mockMarchers),
            getPages: vi.fn().mockResolvedValue(Mocks.mockPages),
            getMarcherPages: vi.fn().mockResolvedValue(Mocks.mockMarcherPages),
        } as Partial<ElectronApi> as ElectronApi;

        vi.mock("@/stores/page/useTimingObjectsStore", () => {
            return {
                useTimingObjectsStore: () => ({
                    pages: Mocks.mockPages,
                    fetchPages: vi.fn(),
                }),
            };
        });
        vi.mock("@/stores/page/useMarcherStore", () => {
            return {
                useMarcherStore: () => ({
                    marchers: Mocks.mockMarchers,
                    fetchMarchers: vi.fn(),
                }),
            };
        });
        vi.mock("@/stores/marcherPage/useMarcherPageStore", () => {
            return {
                useMarcherPageStore: () => ({
                    marcherPages: Mocks.mockMarcherPages,
                    fetchMarcherPages: vi.fn(),
                }),
            };
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it.skip("Canvas renders and contains marchers", () => {
        const NCAAFieldProperties =
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties: NCAAFieldProperties,
            uiSettings: falsyUiSettings,
            currentPage: Mocks.mockPages[0],
        });
        vi.mock("@/context/SelectedPageContext", () => {
            return {
                useSelectedPage: () => ({
                    selectedPage: Mocks.mockPages[0],
                    setSelectedPage: vi.fn(),
                }),
                SelectedPageProvider: ({
                    children,
                }: {
                    children: React.ReactNode;
                }) => <div>{children}</div>,
            };
        });

        renderWithContext(canvas);
        //todo, check that the marchers are correct
        const canvasMarchersOnCanvas = canvas.getCanvasMarchers();
        // console.log(canvas.getObjects());
        expect(canvasMarchersOnCanvas).toContainEqual(Mocks.mockMarchers);
    });

    // TODO create stubs
});
