// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useMusicXmlChecksStore } from "../MusicXmlChecksStore";
import type { ImportCheck } from "@/components/music/musicXmlImportChecks";

const check = (message: string): ImportCheck => ({
    code: "unknown-meter",
    message,
    measures: ["1"],
});

describe("MusicXmlChecksStore", () => {
    beforeEach(() =>
        useMusicXmlChecksStore.setState({
            fileName: "",
            checks: [],
            open: false,
        }),
    );

    it("opens the list on the checks it is given", () => {
        const first = [check("first")];
        const second = [check("second")];
        // An older toast's Show, clicked after a later import, shows its own import's checks
        useMusicXmlChecksStore.getState().showChecks("second.musicxml", second);
        useMusicXmlChecksStore.getState().setOpen(false);
        useMusicXmlChecksStore.getState().showChecks("first.musicxml", first);

        const { fileName, checks, open } = useMusicXmlChecksStore.getState();
        expect({ fileName, checks, open }).toEqual({
            fileName: "first.musicxml",
            checks: first,
            open: true,
        });
    });
});
