import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { useView3dWindowStore } from "@/stores/View3dWindowStore";
import View3dButton from "../View3dButton";

/** The 3D View button beside the workspace switch: only while the window is closed. */

beforeAll(async () => {
    await tolgee.run();
});
beforeEach(() => useView3dWindowStore.setState({ open: false }));
afterEach(cleanup);

describe("View3dButton", () => {
    it("shows while the 3D View is closed and hides while it's open", () => {
        render(
            <TolgeeProvider tolgee={tolgee}>
                <View3dButton />
            </TolgeeProvider>,
        );
        expect(screen.getByTestId("open-view3d")).toBeTruthy();
        act(() => {
            useView3dWindowStore.getState().setOpen(true);
        });
        expect(screen.queryByTestId("open-view3d")).toBeNull();
        act(() => {
            useView3dWindowStore.getState().setOpen(false);
        });
        expect(screen.getByTestId("open-view3d")).toBeTruthy();
    });
});
