import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { AutoOpenQuestion } from "../AutoOpenQuestion";

/** The 3D View's "keep opening with your shows?" card, shown until answered. */

/** The window's settings calls, with `setting` as what main has stored */
const withSetting = (setting: unknown) => {
    const set = vi.fn(() => Promise.resolve());
    (window as unknown as { view3d: unknown }).view3d = {
        autoOpen: { get: () => Promise.resolve(setting), set },
    };
    return set;
};

const open = () =>
    render(
        <TolgeeProvider tolgee={tolgee}>
            <AutoOpenQuestion />
        </TolgeeProvider>,
    );

beforeAll(async () => {
    await tolgee.run();
});
afterEach(cleanup);

describe("AutoOpenQuestion", () => {
    it("asks while the setting was never answered, and saves yes", async () => {
        const set = withSetting(undefined);
        open();
        fireEvent.click(await screen.findByTestId("view3d-auto-open-yes"));
        expect(set).toHaveBeenCalledWith(true);
        expect(screen.queryByTestId("view3d-auto-open-question")).toBeNull();
    });

    it("saves no", async () => {
        const set = withSetting(undefined);
        open();
        fireEvent.click(await screen.findByTestId("view3d-auto-open-no"));
        expect(set).toHaveBeenCalledWith(false);
    });

    it.each([true, false, null])(
        "doesn't ask once answered or where it shouldn't (%s)",
        async (setting) => {
            withSetting(setting);
            const get = vi.spyOn(
                (
                    window as unknown as {
                        view3d: { autoOpen: { get: () => Promise<unknown> } };
                    }
                ).view3d.autoOpen,
                "get",
            );
            open();
            // Once the read has answered, still nothing
            await waitFor(() => expect(get).toHaveBeenCalled());
            await act(() => get.mock.results[0]!.value);
            expect(
                screen.queryByTestId("view3d-auto-open-question"),
            ).toBeNull();
        },
    );
});
