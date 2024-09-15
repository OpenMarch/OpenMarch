import { cleanup, render } from "@testing-library/react";
import { describe, afterEach, it, beforeEach, vi } from "vitest";
import Canvas from "../Canvas";
import * as Mocks from "@/__mocks__/globalMocks";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import { FieldProperties } from "@/global/classes/FieldProperties";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { ElectronApi } from "electron/preload";
import { falsyUiSettings } from "./MocksForCanvas";

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
            </IsPlayingProvider>
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

        vi.mock("@/stores/page/usePageStore", () => {
            return {
                usePageStore: () => ({
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

    it("Canvas renders and contains marchers", () => {
        const NCAAFieldProperties = new FieldProperties(
            FieldProperties.Template.NCAA
        );
        const canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties: NCAAFieldProperties,
            uiSettings: falsyUiSettings,
            currentPage: Mocks.mockPages[0],
        });
        renderWithContext(canvas);
    });
});
