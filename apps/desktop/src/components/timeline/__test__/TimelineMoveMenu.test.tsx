import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import {
    Timeline,
    TimelineWaveformProvider,
    type TimelineInput,
} from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import type { TimelineMoveCommands } from "../TimelineRangeMenu";

/**
 * UI-14: a clip is a move. Its right-click menu, the selected clip's ⋯ button and the focused
 * clip's keys edit, rename and delete it, by its stored timeline's id; page boxes keep **Delete
 * page flag** only, and the rename field's keys stay its own.
 */

afterEach(cleanup);

/** The zero-length beat 0, then `count` timed beats */
const appBeats = (count: number): Beat[] =>
    Array.from({ length: count + 1 }, (_, index) => ({
        id: index + 1,
        position: index,
        duration: index === 0 ? 0 : 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index === 0 ? 0 : (index - 1) * 0.5,
    }));

const BEATS = appBeats(16);

const page = (id: number, name: string, beats: Beat[]): Page =>
    ({
        id,
        name,
        counts: id === 1 ? 0 : beats.length,
        notes: null,
        order: id - 1,
        nextPageId: id < 3 ? id + 1 : null,
        previousPageId: id === 1 ? null : id - 1,
        isSubset: false,
        duration: beats.length * 0.5,
        beats,
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: beats[0]!.timestamp,
    }) as unknown as Page;
const PAGES = [
    page(1, "0", [BEATS[0]!]),
    page(2, "1", BEATS.slice(1, 9)),
    page(3, "2", BEATS.slice(9, 17)),
];

/** A mid-page move over spec beats [3, 7), stored as timeline 7 */
const clip: TimelineInput = {
    id: "timeline-7",
    linkId: 7,
    targetId: 7,
    targetType: "timeline",
    label: "Company front",
    color: "#2fc4b2",
    startBeatIndex: 3,
    endBeatIndex: 7,
    legs: [{ id: "leg", startBeatIndex: 3, endBeatIndex: 7, texture: "move" }],
    activitySpans: [{ startBeatIndex: 3, endBeatIndex: 7, active: true }],
};

const commands = (
    overrides: Partial<TimelineMoveCommands> = {},
): TimelineMoveCommands => ({
    onEdit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    disabledReason: null,
    ...overrides,
});

/** Another move, over spec beats [9, 13), stored as timeline 8 */
const otherClip: TimelineInput = {
    ...clip,
    id: "timeline-8",
    linkId: 8,
    targetId: 8,
    label: "Diagonal",
    startBeatIndex: 9,
    endBeatIndex: 13,
    legs: [
        { id: "leg-8", startBeatIndex: 9, endBeatIndex: 13, texture: "move" },
    ],
    activitySpans: [{ startBeatIndex: 9, endBeatIndex: 13, active: true }],
};

const show = ({
    moves = commands(),
    selection = null,
    onDeletePageFlag,
    mode = "expanded",
    onSelectionChange = vi.fn(),
    timelines = [clip],
}: {
    moves?: TimelineMoveCommands;
    selection?: TimelineSelection;
    onDeletePageFlag?: (pageId: number) => void;
    mode?: "expanded" | "collapsed";
    /** `null`: a timeline whose clips can't be selected */
    onSelectionChange?: ((selection: TimelineSelection) => void) | null;
    timelines?: TimelineInput[];
} = {}) => {
    render(
        <Timeline
            mode={mode}
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={timelines}
            showTransport={false}
            pixelsPerBeat={16}
            selection={selection}
            onSelectionChange={onSelectionChange ?? undefined}
            moveCommands={moves}
            onDeletePageFlag={onDeletePageFlag}
        />,
    );
    return moves;
};

/** The clip selected: its range is the window */
const SELECTED: TimelineSelection = {
    kind: "range",
    range: { startBeatIndex: 3, endBeatIndex: 7 },
};

const clipButton = () =>
    screen.getByRole("button", { name: /Company front timeline/ });
const items = () =>
    screen.getAllByRole("menuitem").map((item) => item.textContent);

/** Records the keys pressed that reach the window, where the app's shortcuts listen */
const windowKeys = () => {
    const keys: string[] = [];
    const listener = (event: KeyboardEvent) => keys.push(event.key);
    beforeEach(() => {
        keys.length = 0;
        window.addEventListener("keydown", listener);
    });
    afterEach(() => window.removeEventListener("keydown", listener));
    return keys;
};

describe("the clip's menu (UI-14)", () => {
    it("offers Edit move, Rename move… and Delete move, red and last, by stored timeline id", () => {
        const moves = show();
        fireEvent.contextMenu(clipButton());
        expect(items()).toEqual(["Edit move", "Rename move…", "Delete move"]);
        const remove = screen.getByTestId("timeline-move-menu-delete");
        expect(remove.className).toContain("text-red");
        fireEvent.click(remove);
        expect(moves.onDelete).toHaveBeenCalledWith(7);

        fireEvent.contextMenu(clipButton());
        fireEvent.click(screen.getByTestId("timeline-move-menu-edit"));
        expect(moves.onEdit).toHaveBeenCalledWith(7);
    });

    it("keeps Delete page flag alone on a page box, and nothing on a dragged range", () => {
        show({
            onDeletePageFlag: vi.fn(),
            selection: {
                kind: "range",
                range: { startBeatIndex: 11, endBeatIndex: 15 },
            },
        });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        expect(items()).toEqual(["Delete page flag"]);
        cleanup();
        show({
            selection: {
                kind: "range",
                range: { startBeatIndex: 11, endBeatIndex: 15 },
            },
        });
        fireEvent.contextMenu(screen.getByTestId("timeline-pointer-surface"), {
            clientX: 16 * 12,
        });
        expect(screen.queryByRole("menuitem")).toBeNull();
    });

    it("disables Edit and Delete while playing, with the reason; Rename stays", () => {
        const moves = show({
            moves: commands({
                disabledReason: "Pause to edit or delete a move.",
            }),
        });
        fireEvent.contextMenu(clipButton());
        expect(
            screen
                .getByTestId("timeline-move-menu-edit")
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
            screen
                .getByTestId("timeline-move-menu-delete")
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
            screen
                .getByTestId("timeline-move-menu-rename")
                .getAttribute("aria-disabled"),
        ).toBeNull();
        expect(
            screen.getByTestId("timeline-move-menu-reason").textContent,
        ).toMatch(/Pause/);
        fireEvent.click(screen.getByTestId("timeline-move-menu-delete"));
        expect(moves.onDelete).not.toHaveBeenCalled();
    });
});

describe("the ⋯ button (UI-14)", () => {
    it("shows on the selected clip only, and opens the same menu", async () => {
        show();
        expect(screen.queryByTestId("timeline-clip-menu-button")).toBeNull();
        cleanup();
        const moves = show({ selection: SELECTED });
        const button = screen.getByTestId("timeline-clip-menu-button");
        fireEvent.keyDown(button, { key: "Enter" });
        await waitFor(() =>
            expect(items()).toEqual([
                "Edit move",
                "Rename move…",
                "Delete move",
            ]),
        );
        fireEvent.click(screen.getByTestId("timeline-move-menu-edit"));
        expect(moves.onEdit).toHaveBeenCalledWith(7);
    });

    it("a press in its menu stays in the menu: it doesn't scrub the timeline under it", async () => {
        const onSeek = vi.fn();
        render(
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={PAGES}
                measures={[]}
                timelines={[clip]}
                showTransport={false}
                pixelsPerBeat={16}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                playback={{ positionBeat: 7, isPlaying: false, onSeek }}
                moveCommands={commands()}
            />,
        );
        fireEvent.keyDown(screen.getByTestId("timeline-clip-menu-button"), {
            key: "Enter",
        });
        const rename = await screen.findByTestId("timeline-move-menu-rename");
        fireEvent.pointerDown(rename, { button: 0, clientX: 40 });
        fireEvent.pointerUp(rename, { button: 0, clientX: 40 });
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("sits just past the end of a clip too narrow for it, never hidden", () => {
        // 4 beats at 4px a beat is 16px: no room for the label and the button
        render(
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={PAGES}
                measures={[]}
                timelines={[clip]}
                showTransport={false}
                pixelsPerBeat={4}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                moveCommands={commands()}
            />,
        );
        const anchor = screen.getByTestId("timeline-clip-menu-anchor");
        const clipEl = clipButton();
        const clipEnd =
            parseFloat(clipEl.style.left) + parseFloat(clipEl.style.width);
        expect(parseFloat(anchor.style.left)).toBeGreaterThanOrEqual(clipEnd);
        expect(screen.queryByTestId("timeline-clip-label")).toBeNull();
    });

    it("sticks inside the visible timeline, with a 16px target and a tooltip", () => {
        show({ selection: SELECTED });
        const button = screen.getByTestId("timeline-clip-menu-button");
        // Sticky inside a span over the clip: at its end, or the viewport's right edge
        expect(button.className).toContain("sticky");
        expect(parseFloat(button.style.width)).toBeGreaterThanOrEqual(16);
        expect(parseFloat(button.style.height)).toBeGreaterThanOrEqual(16);
        expect(button.title).toBe("Move options");
        const anchor = screen.getByTestId("timeline-clip-menu-anchor");
        const clipEl = clipButton();
        expect(anchor.style.left).toBe(clipEl.style.left);
    });

    it("the label truncates with an ellipsis", () => {
        show();
        const label = screen.getByTestId("timeline-clip-label");
        expect(label.className).toContain("truncate");
        expect(label.className).toContain("block");
        expect(label.className).not.toContain("flex");
    });

    it("shows in compact too", () => {
        show({ selection: SELECTED, mode: "collapsed" });
        expect(screen.getByTestId("timeline-clip-menu-button")).toBeTruthy();
    });
});

describe("the focused clip's keys (UI-14)", () => {
    const reached = windowKeys();

    it("Delete and Backspace delete the move and never reach the app's shortcuts", () => {
        const moves = show();
        fireEvent.keyDown(clipButton(), { key: "Delete" });
        fireEvent.keyDown(clipButton(), { key: "Backspace" });
        expect(moves.onDelete).toHaveBeenCalledTimes(2);
        expect(moves.onDelete).toHaveBeenCalledWith(7);
        expect(reached).toEqual([]);
    });

    it("while playing, Delete does nothing, and still doesn't reach them", () => {
        const moves = show({ moves: commands({ disabledReason: "Pause" }) });
        fireEvent.keyDown(clipButton(), { key: "Delete" });
        expect(moves.onDelete).not.toHaveBeenCalled();
        expect(reached).toEqual([]);
    });

    it("the ContextMenu key and Shift+F10 open the move's menu", async () => {
        show();
        fireEvent.keyDown(clipButton(), { key: "ContextMenu" });
        await waitFor(() => expect(items()).toContain("Delete move"));
        cleanup();
        show();
        fireEvent.keyDown(clipButton(), { key: "F10", shiftKey: true });
        await waitFor(() => expect(items()).toContain("Delete move"));
    });

    it("Enter on a clip that isn't selected selects it, as a click does, and renames nothing", () => {
        const onSelectionChange = vi.fn();
        const moves = show({ onSelectionChange });
        expect(fireEvent.keyDown(clipButton(), { key: "Enter" })).toBe(false);
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        fireEvent.click(clipButton());
        // The same selection a click makes
        expect(onSelectionChange.mock.calls[1]).toEqual(
            onSelectionChange.mock.calls[0],
        );
        expect(screen.queryByTestId("timeline-move-name-field")).toBeNull();
        expect(moves.onRename).not.toHaveBeenCalled();
        expect(reached).toEqual([]);
    });

    it("where a clip can't be selected, Enter renames it rather than doing nothing", async () => {
        show({ onSelectionChange: null });
        expect(fireEvent.keyDown(clipButton(), { key: "Enter" })).toBe(false);
        expect(screen.getByTestId("timeline-move-name-field")).toBeTruthy();
        expect(reached).toEqual([]);
        cleanup();
        show({ onSelectionChange: null });
        expect(
            document.getElementById(
                clipButton().getAttribute("aria-describedby")!,
            )?.textContent,
        ).toBe(
            "Enter or F2 to rename, Shift+F10 for options, Delete to delete",
        );
    });

    it("Enter on the selected clip and F2 on any open the rename field, and Enter never reaches the app's shortcuts", async () => {
        show({ selection: SELECTED });
        fireEvent.keyDown(clipButton(), { key: "Enter" });
        expect(reached).toEqual([]);
        await waitFor(() =>
            expect(screen.getByTestId("timeline-move-name-field")).toBeTruthy(),
        );
        cleanup();
        show();
        fireEvent.keyDown(clipButton(), { key: "F2" });
        expect(screen.getByTestId("timeline-move-name-field")).toBeTruthy();
    });

    it("other keys pass through", () => {
        show();
        fireEvent.keyDown(clipButton(), { key: "g" });
        expect(reached).toEqual(["g"]);
    });
});

describe("renaming on the clip (UI-14)", () => {
    const reached = windowKeys();

    const startRename = async (moves = commands()) => {
        show({ moves });
        fireEvent.contextMenu(clipButton());
        fireEvent.click(screen.getByTestId("timeline-move-menu-rename"));
        const field = screen.getByTestId(
            "timeline-move-name-field",
        ) as HTMLInputElement;
        await waitFor(() => expect(document.activeElement).toBe(field));
        return { moves, field };
    };

    it("opens on the label, selected, and Enter commits what was typed", async () => {
        const { moves, field } = await startRename();
        expect(field.value).toBe("Company front");
        expect(field.selectionStart).toBe(0);
        expect(field.selectionEnd).toBe("Company front".length);
        expect(field.maxLength).toBe(80);
        fireEvent.change(field, { target: { value: "Opener hit" } });
        fireEvent.keyDown(field, { key: "Enter" });
        expect(moves.onRename).toHaveBeenCalledWith(7, "Opener hit");
        expect(screen.queryByTestId("timeline-move-name-field")).toBeNull();
    });

    it("Esc cancels", async () => {
        const { moves, field } = await startRename();
        fireEvent.change(field, { target: { value: "Opener hit" } });
        fireEvent.keyDown(field, { key: "Escape" });
        expect(moves.onRename).not.toHaveBeenCalled();
        expect(screen.queryByTestId("timeline-move-name-field")).toBeNull();
    });

    it("leaving the field commits; empty is sent, to clear the name", async () => {
        const { moves, field } = await startRename();
        fireEvent.change(field, { target: { value: "" } });
        fireEvent.blur(field);
        expect(moves.onRename).toHaveBeenCalledWith(7, "");
    });

    it("an unchanged name sends nothing", async () => {
        const { moves, field } = await startRename();
        fireEvent.change(field, { target: { value: " Company front " } });
        fireEvent.keyDown(field, { key: "Enter" });
        expect(moves.onRename).not.toHaveBeenCalled();
    });

    it("says when the 80-character limit is reached, instead of cutting silently", async () => {
        const { field } = await startRename();
        expect(screen.queryByTestId("timeline-move-name-limit")).toBeNull();
        fireEvent.change(field, { target: { value: "x".repeat(80) } });
        expect(
            screen.getByTestId("timeline-move-name-limit").textContent,
        ).toMatch(/80 characters at most/);
    });

    it("its keys stay its own: G, Space, Delete and Shift+Z reach no shortcut", async () => {
        const { moves, field } = await startRename();
        for (const key of ["g", " ", "Delete", "Backspace", "Z"])
            fireEvent.keyDown(field, { key, shiftKey: key === "Z" });
        expect(reached).toEqual([]);
        expect(moves.onDelete).not.toHaveBeenCalled();
    });
});

describe("short clips under the flags and the playhead (UI-14)", () => {
    it("the start flag and the playhead take the pointer only above the clip rows", () => {
        render(
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={PAGES}
                measures={[]}
                timelines={[clip]}
                showTransport={false}
                pixelsPerBeat={16}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                playback={{
                    positionBeat: 7,
                    isPlaying: false,
                    onSeek: vi.fn(),
                }}
                moveCommands={commands()}
            />,
        );
        const clipTop = parseFloat(clipButton().style.top);
        for (const handle of [
            screen.getByRole("button", { name: /^Start flag/ }),
            screen.getByTestId("timeline-playhead"),
        ])
            expect(parseFloat(handle.style.height)).toBeLessThanOrEqual(
                clipTop,
            );
    });
});

describe("the round-2 review's keys and focus (UI-14)", () => {
    const reached = windowKeys();

    it("Space on a focused clip or its ⋯ button plays: it reaches the app, and presses nothing", async () => {
        const moves = show({ selection: SELECTED });
        for (const target of [
            clipButton(),
            screen.getByTestId("timeline-clip-menu-button"),
        ]) {
            target.focus();
            const down = fireEvent.keyDown(target, { key: " " });
            const up = fireEvent.keyUp(target, { key: " " });
            // Cancelled: the button's own Space click doesn't happen
            expect(down).toBe(false);
            expect(up).toBe(false);
        }
        expect(reached).toEqual([" ", " "]);
        expect(screen.queryAllByRole("menuitem")).toEqual([]);
        expect(moves.onRename).not.toHaveBeenCalled();
    });

    it("the arrows and WASD on a focused clip do nothing, and don't reach the app", () => {
        show();
        for (const [key, code] of [
            ["ArrowLeft", "ArrowLeft"],
            ["ArrowUp", "ArrowUp"],
            ["d", "KeyD"],
            ["W", "KeyW"],
            // A French layout: the app nudges by the physical key, whatever it types
            ["q", "KeyA"],
            ["z", "KeyW"],
        ])
            expect(fireEvent.keyDown(clipButton(), { key, code })).toBe(false);
        expect(reached).toEqual([]);
    });

    it("a rename left by clicking another clip leaves focus there: Delete never deletes the renamed one", async () => {
        const moves = show({ timelines: [clip, otherClip] });
        const first = clipButton();
        const second = screen.getByRole("button", {
            name: /Diagonal timeline/,
        });
        fireEvent.keyDown(first, { key: "F2" });
        const field = screen.getByTestId("timeline-move-name-field");
        await waitFor(() => expect(document.activeElement).toBe(field));
        fireEvent.change(field, { target: { value: "Opener" } });
        // A click on the other clip: the press, focus going there, the click
        fireEvent.pointerDown(second);
        second.focus();
        fireEvent.click(second);
        expect(moves.onRename).toHaveBeenCalledWith(7, "Opener");
        // Past the frame the field would have taken focus back in
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(document.activeElement).toBe(second);
        fireEvent.keyDown(document.activeElement!, { key: "Delete" });
        expect(moves.onDelete).not.toHaveBeenCalledWith(7);
        expect(moves.onDelete).toHaveBeenCalledWith(8);
    });

    it("a rename left by a click on something that takes no focus (the lane, a marcher) leaves focus there, not on the clip", async () => {
        const moves = show();
        fireEvent.keyDown(clipButton(), { key: "F2" });
        const field = screen.getByTestId("timeline-move-name-field");
        await waitFor(() => expect(document.activeElement).toBe(field));
        fireEvent.change(field, { target: { value: "Opener" } });
        // A press on nothing focusable: focus falls to the page, and stays there
        fireEvent.pointerDown(document.body);
        field.blur();
        expect(moves.onRename).toHaveBeenCalledWith(7, "Opener");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(document.activeElement).toBe(document.body);
        // So Delete is the app's (the selected marchers'), not the move's
        fireEvent.keyDown(document.activeElement!, { key: "Delete" });
        expect(moves.onDelete).not.toHaveBeenCalled();
    });

    it("after a rename, saved or cancelled, focus is back on the clip", async () => {
        show();
        for (const finish of ["Enter", "Escape"]) {
            fireEvent.keyDown(clipButton(), { key: "F2" });
            const field = screen.getByTestId("timeline-move-name-field");
            await waitFor(() => expect(document.activeElement).toBe(field));
            fireEvent.change(field, { target: { value: "Opener" } });
            fireEvent.keyDown(field, { key: finish });
            await waitFor(() =>
                expect(document.activeElement).toBe(clipButton()),
            );
        }
    });

    it("a name being typed is saved when its field goes away before it blurs", async () => {
        const moves = show();
        fireEvent.keyDown(clipButton(), { key: "F2" });
        const field = screen.getByTestId("timeline-move-name-field");
        fireEvent.change(field, { target: { value: "Opener" } });
        // A click on the lane selects another window first: the timeline goes, field and all
        cleanup();
        expect(moves.onRename).toHaveBeenCalledWith(7, "Opener");
        expect(moves.onRename).toHaveBeenCalledTimes(1);
    });

    it("an untouched field that goes away saves nothing", async () => {
        const moves = show();
        fireEvent.keyDown(clipButton(), { key: "F2" });
        cleanup();
        expect(moves.onRename).not.toHaveBeenCalled();
    });
});

describe("a move clip's words (UI-14 round-2 review)", () => {
    const named: TimelineInput = {
        ...clip,
        accessibleName: "Company front, move, Page 1, counts 3–6",
        description: "Overridden by Move 4 on Page 1, counts 5–6",
    };
    const render1 = (selection: TimelineSelection) =>
        render(
            <Timeline
                mode="expanded"
                beats={BEATS}
                pages={PAGES}
                measures={[]}
                timelines={[named]}
                showTransport={false}
                pixelsPerBeat={16}
                selection={selection}
                onSelectionChange={vi.fn()}
                moveCommands={commands()}
            />,
        );

    it("is named as a move in counts, says selected rather than pressed, and hints its keys", () => {
        render1(SELECTED);
        const button = screen.getByTestId("timeline-clip");
        expect(button.getAttribute("aria-label")).toBe(
            "Company front, move, Page 1, counts 3–6, selected",
        );
        expect(button.hasAttribute("aria-pressed")).toBe(false);
        expect(
            document.getElementById(button.getAttribute("aria-describedby")!)
                ?.textContent,
        ).toBe(
            "Overridden by Move 4 on Page 1, counts 5–6. Enter or F2 to rename, Shift+F10 for options, Delete to delete",
        );
        expect(button.title).toContain("Overridden by Move 4");
        cleanup();
        render1(null);
        const unselected = screen.getByTestId("timeline-clip");
        expect(unselected.getAttribute("aria-label")).toBe(
            "Company front, move, Page 1, counts 3–6",
        );
        // Not selected, Enter selects it
        expect(
            document.getElementById(
                unselected.getAttribute("aria-describedby")!,
            )?.textContent,
        ).toBe(
            "Overridden by Move 4 on Page 1, counts 5–6. Enter to select, F2 to rename, Shift+F10 for options, Delete to delete",
        );
    });
});

describe("the flags over the waveform row (UI-14 round-2 review)", () => {
    it("take the pointer only in the ruler and measure rows, so a Ctrl+drag on the waveform draws", () => {
        render(
            <TimelineWaveformProvider
                waveform={{ peaksByBeat: BEATS.map(() => [0.4, 0.6]) }}
            >
                <Timeline
                    mode="expanded"
                    beats={BEATS}
                    pages={PAGES}
                    measures={[]}
                    timelines={[clip]}
                    showTransport={false}
                    pixelsPerBeat={16}
                    selection={SELECTED}
                    onSelectionChange={vi.fn()}
                    playback={{
                        positionBeat: 7,
                        isPlaying: false,
                        onSeek: vi.fn(),
                    }}
                    moveCommands={commands()}
                />
            </TimelineWaveformProvider>,
        );
        // The ruler (28px), the measure row (20px) and a 2px gap; the waveform row starts there
        for (const handle of [
            screen.getByRole("button", { name: /^Start flag/ }),
            screen.getByTestId("timeline-playhead"),
        ])
            expect(parseFloat(handle.style.height)).toBe(50);
    });
});
