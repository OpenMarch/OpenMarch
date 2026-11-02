import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DevSkipSetupButton from "../DevSkipSetupButton";

vi.mock("@/utilities/devBuild", () => ({ isDevBuild: false }));

describe("DevSkipSetupButton", () => {
    it("renders nothing outside developer builds", () => {
        render(<DevSkipSetupButton onSkip={() => {}} />);
        expect(screen.queryByTestId("welcome-dev-skip")).toBeNull();
    });
});
