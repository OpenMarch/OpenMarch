import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Keycaps from "../Keycaps";

describe("Keycaps", () => {
    it("renders one cap per key", () => {
        render(<Keycaps keys={["⌘", "⇧", "Z"]} />);
        expect(screen.getAllByText(/^(⌘|⇧|Z)$/)).toHaveLength(3);
    });
});
