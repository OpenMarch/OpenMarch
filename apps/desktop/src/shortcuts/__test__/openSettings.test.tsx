import { renderHook } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { runAction } from "@/shortcuts/registry";
import { useFileActionHandlers } from "@/shortcuts/handlers/useFileActionHandlers";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

describe("openSettings", () => {
    beforeAll(async () => {
        await tolgee.run();
    });

    it("opens the settings window with no show open", () => {
        const openSettingsWindow = vi.fn().mockResolvedValue(undefined);
        Object.assign(window, { electron: { openSettingsWindow } });
        renderHook(() => useFileActionHandlers(), { wrapper: Providers });
        expect(runAction("openSettings")).toBe(true);
        expect(openSettingsWindow).toHaveBeenCalledOnce();
    });
});
