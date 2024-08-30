import { cleanup, render } from "@testing-library/react";
import {
    describe,
    expect,
    afterEach,
    it,
    beforeEach,
    vi,
    beforeAll,
} from "vitest";
import Canvas from "../Canvas";
import * as Mocks from "@/__mocks__/globalMocks";
import OpenMarchCanvas from "../OpenMarchCanvas";
import { FieldProperties } from "@/global/classes/FieldProperties";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { ElectronApi } from "electron/preload";
import { createRef } from "react";

// import { mockMarchers, mockPages } from "@/__mocks__/globalMocks";
// import { createMarcherPages } from "@/utilities/TestingUtilities";

// const initialMockMarcherPages = createMarcherPages(mockMarchers, mockPages);

describe("Canvas", () => {
    const renderWithContext = (
        canvas: OpenMarchCanvas,
        canvasRef: React.RefObject<any>
    ) => {
        render(
            <IsPlayingProvider>
                <SelectedPageProvider>
                    <SelectedMarchersProvider>
                        <SelectedAudioFileProvider>
                            <FieldPropertiesProvider>
                                <Canvas testCanvas={canvas} ref={canvasRef} />
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

    it("selects a single marcher in the store when selected on the canvas", () => {
        const NCAAFieldProperties = new FieldProperties(
            FieldProperties.Template.NCAA
        );
        const canvasRef = createRef<OpenMarchCanvas>();
        const canvas = new OpenMarchCanvas(null, NCAAFieldProperties);
        renderWithContext(canvas);
        console.log("canvas", canvas.getObjects());
    });
});
