import {
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
    fieldPropertiesQueryOptions,
    swapMarchersMutationOptions,
    useUpdateSelectedMarchersOnSelectedPage,
    moveMarchersOnPageMutationOptions,
    moveMarchersInTargetMutationOptions,
} from "@/hooks/queries";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import type { ModifiedMarcherPageArgs } from "@/db-functions/marcherPage";
import {
    planCanvasEdit,
    snapIsolatedPlayheadToEnd,
    timelineCoordinateRecords,
    toTimelineMoves,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { PAGE_SHAPES_TIMELINE_MESSAGE } from "@/db-functions/shapePages";
import {
    setMarchersToNeighborPage,
    type NeighborPageDirection,
    type NeighborPageScope,
} from "./setMarchersToNeighborPage";
import { createCircle } from "@openmarch/core";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useCallback, useEffect, useRef } from "react";
import * as CoordinateActions from "./CoordinateActions";
import { getNextPage, getPreviousPage } from "@/global/classes/Page";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { useCreateMarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useSelectionStore } from "@/stores/SelectionStore";
import { toast } from "sonner";
import { useTimingObjects } from "@/hooks";
import {
    navigateTimelinePages,
    stopTimelinePlayback,
    toggleTimelinePlayback,
} from "@/timeline/timelineTransport";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import tolgee from "@/global/singletons/Tolgee";
import { T, useTolgee } from "@tolgee/react";
import { useMetronomeStore } from "@/stores/MetronomeStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    usePerformHistoryAction,
    canUndoQueryOptions,
    canRedoQueryOptions,
} from "@/hooks/queries/useHistory";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { requestOpenNewShowDialog } from "@/utilities/openNewShowDialog";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import { AlertDialogAction, AlertDialogCancel, Button } from "@openmarch/ui";
import { CircleNotchIcon } from "@phosphor-icons/react";
import {
    isTimelineOwnKey,
    skipsAppNudge,
} from "@/components/timeline/timelineHotkeys";

/**
 * The interface for the registered actions. This exists so it is easy to see what actions are available.
 */
export enum RegisteredActionsEnum {
    // Electron interactions
    launchLoadFileDialogue = "launchLoadFileDialogue",
    launchSaveFileDialogue = "launchSaveFileDialogue",
    launchNewFileDialogue = "launchNewFileDialogue",
    launchInsertAudioFileDialogue = "launchInsertAudioFileDialogue",
    launchImportMusicXmlFileDialogue = "launchImportMusicXmlFileDialogue",
    performUndo = "performUndo",
    performRedo = "performRedo",

    // Navigation and playback
    nextPage = "nextPage",
    lastPage = "lastPage",
    previousPage = "previousPage",
    firstPage = "firstPage",
    playPause = "playPause",
    stopPlayback = "stopPlayback",
    togglePlayFromStart = "togglePlayFromStart",
    toggleMetronome = "toggleMetronome",

    // Batch editing
    setAllMarchersToPreviousPage = "setAllMarchersToPreviousPage",
    setSelectedMarchersToPreviousPage = "setSelectedMarchersToPreviousPage",
    setAllMarchersToNextPage = "setAllMarchersToNextPage",
    setSelectedMarchersToNextPage = "setSelectedMarchersToNextPage",

    // Alignment
    snapToNearestCustomFraction = "snapToNearestCustomFraction",
    lockX = "lockX",
    lockY = "lockY",
    alignVertically = "alignVertically",
    alignHorizontally = "alignHorizontally",
    evenlyDistributeHorizontally = "evenlyDistributeHorizontally",
    evenlyDistributeVertically = "evenlyDistributeVertically",
    flipHorizontal = "flipHorizontal",
    flipVertical = "flipVertical",
    swapMarchers = "swapMarchers",
    moveSelectedMarchersUp = "moveSelectedMarchersUp",
    moveSelectedMarchersDown = "moveSelectedMarchersDown",
    moveSelectedMarchersLeft = "moveSelectedMarchersLeft",
    moveSelectedMarchersRight = "moveSelectedMarchersRight",

    // UI settings
    toggleNextPagePaths = "toggleNextPagePaths",
    togglePreviousPagePaths = "togglePreviousPagePaths",
    focusCanvas = "focusCanvas",
    focusTimeline = "focusTimeline",

    // Cursor Mode
    applyQuickShape = "applyQuickShape",
    createMarcherShape = "createMarcherShape",
    deleteMarcherShape = "deleteMarcherShape",
    cancelAlignmentUpdates = "cancelAlignmentUpdates",
    alignmentEventDefault = "alignmentEventDefault",
    alignmentEventLine = "alignmentEventLine",

    // Select
    selectAllMarchers = "selectAllMarchers",

    // Shapes
    createCircle = "createCircle",
}

/**
 * THIS SHOULD NOT BE USED DIRECTLY. Use the RegisteredActionsEnum and RegisteredActionsObjects instead.
 *
 * A RegisteredAction is a uniform object to represent a function in OpenMarch.
 * RegisteredActions can be triggered by a keyboard shortcut or by registering
 * a button ref to the RegisteredActionsStore.
 *
 * Use the getRegisteredAction function to get the RegisteredAction object for a given action.
 */
export class RegisteredAction {
    /** The KeyboardShortcut to trigger the action */
    readonly keyboardShortcut?: KeyboardShortcut;
    /** The translation key for the description of the action. Also used for the instructional string
     * E.g. "actions.alignment.lockX" */
    readonly descKey: string;
    /** The translation key for toggle on state (only relevant for toggle-based actions)
     * E.g. "actions.alignment.lockXOn" */
    readonly toggleOnKey?: string;
    /** The translation key for toggle off state (only relevant for toggle-based actions)
     * E.g. "actions.alignment.lockXOff" */
    readonly toggleOffKey?: string;
    /** The string representation of the action. E.g. "lockX" */
    readonly enumString: string;

    /**
     *
     * @param keyboardShortcut The keyboard shortcut to trigger the action. Optional.
     * @param descKey The translation key for the description of the action. "actions.alignment.lockX"
     * @param toggleOnKey The translation key for toggle on state. Optional.
     * @param toggleOffKey The translation key for toggle off state. Optional.
     */
    constructor({
        keyboardShortcut,
        descKey,
        toggleOnKey,
        toggleOffKey,
        enumString,
    }: {
        keyboardShortcut?: KeyboardShortcut;
        descKey: string;
        action?: () => any;
        toggleOnKey?: string;
        toggleOffKey?: string;
        enumString: string;
    }) {
        this.keyboardShortcut = keyboardShortcut;
        this.descKey = descKey;
        this.toggleOnKey = toggleOnKey;
        this.toggleOffKey = toggleOffKey;

        if (
            !Object.values(RegisteredActionsEnum).includes(
                enumString as RegisteredActionsEnum,
            )
        )
            console.error(`Invalid enumString: ${enumString}. This should be a RegisteredActionsEnum value.
        \nRegistered action for "${descKey}" will not be registered to buttons.`);
        this.enumString = enumString;
    }

    /**
     * Get the translated description with optional keyboard shortcut
     */
    getInstructionalString(): string {
        const keyString = this.keyboardShortcut
            ? ` [${this.keyboardShortcut.toString()}]`
            : "";
        return tolgee.t(this.descKey) + keyString;
    }

    /**
     * Get the translated toggle on string with optional keyboard shortcut
     */
    getInstructionalStringToggleOn(): string {
        const keyString = this.keyboardShortcut
            ? ` [${this.keyboardShortcut.toString()}]`
            : "";
        const key = this.toggleOnKey || this.descKey;
        return tolgee.t(key) + keyString;
    }

    /**
     * Get the translated toggle off string with optional keyboard shortcut
     */
    getInstructionalStringToggleOff(): string {
        const keyString = this.keyboardShortcut
            ? ` [${this.keyboardShortcut.toString()}]`
            : "";
        const key = this.toggleOffKey || this.descKey;
        return tolgee.t(key) + keyString;
    }
}

/**
 * A KeyboardShortcut is a combination of a key and modifiers that can trigger an action.
 */
class KeyboardShortcut {
    /** The key to press to trigger the action (not case sensitive). E.g. "q" */
    readonly key: string;
    /** True if the control key needs to be held down (Command in macOS)*/
    readonly control: boolean;
    /** True if the alt key needs to be held down (option in macOS) */
    readonly alt: boolean;
    /** True if the shift key needs to be held down */
    readonly shift: boolean;

    constructor({
        key,
        control = false,
        alt = false,
        shift = false,
    }: {
        key: string;
        control?: boolean;
        alt?: boolean;
        shift?: boolean;
    }) {
        this.key = key.toLowerCase();
        this.control = control;
        this.alt = alt;
        this.shift = shift;
    }

    /**
     * Returns a string representation of the key and modifiers.
     * @returns The string representation of the key and modifiers. E.g. "Ctrl + Shift + Q"
     */
    toString() {
        const keyStr = this.key === " " ? "Space" : this.key.toUpperCase();
        return `${this.control ? "Ctrl + " : ""}${this.alt ? "Alt + " : ""}${
            this.shift ? "Shift + " : ""
        }${keyStr}`;
    }

    /**
     * Returns true if the shortcut's keys are equal. (including control, alt, and shift keys)
     * @param action The action to compare
     * @returns True if the shortcut's keys are equal
     */
    equal(action: KeyboardShortcut) {
        return (
            this.key === action.key &&
            this.control === action.control &&
            this.alt === action.alt &&
            this.shift === action.shift
        );
    }
}

/**
 * Details for all the registered actions.
 * This is useful for getting the details of a registered action at compile time.
 *
 * When adding a new action, use a translation key and translate it in the i18n files or on Tolgee.
 * The translation key should be in the format "actions.{category}.{action}".
 */
/** Playback controls, which leave a held preview frame alone (UI-11) */
const TRANSPORT_ACTIONS: ReadonlySet<RegisteredActionsEnum> = new Set([
    RegisteredActionsEnum.playPause,
    RegisteredActionsEnum.stopPlayback,
    RegisteredActionsEnum.togglePlayFromStart,
    RegisteredActionsEnum.toggleMetronome,
]);

export const RegisteredActionsObjects: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [key in RegisteredActionsEnum]: RegisteredAction;
} = {
    // Electron interactions
    launchLoadFileDialogue: new RegisteredAction({
        descKey: "actions.file.loadDialogue",
        enumString: "launchLoadFileDialogue",
    }),
    launchSaveFileDialogue: new RegisteredAction({
        descKey: "actions.file.saveDialogue",
        enumString: "launchSaveFileDialogue",
    }),
    launchNewFileDialogue: new RegisteredAction({
        descKey: "actions.file.newDialogue",
        enumString: "launchNewFileDialogue",
    }),
    launchInsertAudioFileDialogue: new RegisteredAction({
        descKey: "actions.file.insertAudio",
        enumString: "launchInsertAudioFileDialogue",
    }),
    launchImportMusicXmlFileDialogue: new RegisteredAction({
        descKey: "actions.file.importMusicXml",
        enumString: "launchImportMusicXmlFileDialogue",
    }),
    performUndo: new RegisteredAction({
        descKey: "actions.edit.undo",
        keyboardShortcut: new KeyboardShortcut({ key: "z", control: true }),
        enumString: "performUndo",
    }),
    performRedo: new RegisteredAction({
        descKey: "actions.edit.redo",
        keyboardShortcut: new KeyboardShortcut({
            key: "z",
            control: true,
            shift: true,
        }),
        enumString: "performRedo",
    }),

    // Navigation and playback
    nextPage: new RegisteredAction({
        descKey: "actions.navigation.nextPage",
        keyboardShortcut: new KeyboardShortcut({ key: "e" }),
        enumString: "nextPage",
    }),
    lastPage: new RegisteredAction({
        descKey: "actions.navigation.lastPage",
        keyboardShortcut: new KeyboardShortcut({ key: "e", shift: true }),
        enumString: "lastPage",
    }),
    previousPage: new RegisteredAction({
        descKey: "actions.navigation.previousPage",
        keyboardShortcut: new KeyboardShortcut({ key: "q" }),
        enumString: "previousPage",
    }),
    firstPage: new RegisteredAction({
        descKey: "actions.navigation.firstPage",
        keyboardShortcut: new KeyboardShortcut({ key: "q", shift: true }),
        enumString: "firstPage",
    }),
    playPause: new RegisteredAction({
        descKey: "actions.playback.playPause",
        toggleOnKey: "actions.playback.play",
        toggleOffKey: "actions.playback.pause",
        keyboardShortcut: new KeyboardShortcut({ key: " " }),
        enumString: "playPause",
    }),
    stopPlayback: new RegisteredAction({
        descKey: "actions.playback.stop",
        keyboardShortcut: new KeyboardShortcut({ key: " ", shift: true }),
        enumString: "stopPlayback",
    }),
    togglePlayFromStart: new RegisteredAction({
        descKey: "actions.playback.togglePlayFromStart",
        keyboardShortcut: new KeyboardShortcut({ key: "c" }),
        enumString: "togglePlayFromStart",
    }),
    toggleMetronome: new RegisteredAction({
        descKey: "actions.playback.toggleMetronome",
        keyboardShortcut: new KeyboardShortcut({ key: "m", control: true }),
        enumString: "toggleMetronome",
    }),

    // Batch editing
    setAllMarchersToPreviousPage: new RegisteredAction({
        descKey: "actions.batchEdit.setAllToPrevious",
        keyboardShortcut: new KeyboardShortcut({
            key: "p",
            shift: true,
            control: true,
        }),
        enumString: "setAllMarchersToPreviousPage",
    }),
    setSelectedMarchersToPreviousPage: new RegisteredAction({
        descKey: "actions.batchEdit.setSelectedToPrevious",
        keyboardShortcut: new KeyboardShortcut({ key: "p", shift: true }),
        enumString: "setSelectedMarchersToPreviousPage",
    }),
    setAllMarchersToNextPage: new RegisteredAction({
        descKey: "actions.batchEdit.setAllToNext",
        keyboardShortcut: new KeyboardShortcut({
            key: "n",
            shift: true,
            control: true,
        }),
        enumString: "setAllMarchersToNextPage",
    }),
    setSelectedMarchersToNextPage: new RegisteredAction({
        descKey: "actions.batchEdit.setSelectedToNext",
        keyboardShortcut: new KeyboardShortcut({ key: "n", shift: true }),
        enumString: "setSelectedMarchersToNextPage",
    }),

    // Marcher movement
    // The following special commands are triggered by WASD/Arrows in handleKeyDown
    moveSelectedMarchersUp: new RegisteredAction({
        descKey: "actions.movement.moveUp",
        keyboardShortcut: new KeyboardShortcut({ key: "" }),
        enumString: "moveSelectedMarchersUp",
    }),
    moveSelectedMarchersDown: new RegisteredAction({
        descKey: "actions.movement.moveDown",
        keyboardShortcut: new KeyboardShortcut({ key: "" }),
        enumString: "moveSelectedMarchersDown",
    }),
    moveSelectedMarchersLeft: new RegisteredAction({
        descKey: "actions.movement.moveLeft",
        keyboardShortcut: new KeyboardShortcut({ key: "" }),
        enumString: "moveSelectedMarchersLeft",
    }),
    moveSelectedMarchersRight: new RegisteredAction({
        descKey: "actions.movement.moveRight",
        keyboardShortcut: new KeyboardShortcut({ key: "" }),
        enumString: "moveSelectedMarchersRight",
    }),

    // Alignment
    snapToNearestCustomFraction: new RegisteredAction({
        descKey: "actions.alignment.snapToCustomFraction",
        keyboardShortcut: new KeyboardShortcut({ key: "1" }),
        enumString: "snapToNearestCustomFraction",
    }),
    lockX: new RegisteredAction({
        descKey: "actions.alignment.lockX",
        toggleOnKey: "actions.alignment.lockXOn",
        toggleOffKey: "actions.alignment.lockXOff",
        keyboardShortcut: new KeyboardShortcut({ key: "y" }),
        enumString: "lockX",
    }),
    lockY: new RegisteredAction({
        descKey: "actions.alignment.lockY",
        toggleOnKey: "actions.alignment.lockYOn",
        toggleOffKey: "actions.alignment.lockYOff",
        keyboardShortcut: new KeyboardShortcut({ key: "x" }),
        enumString: "lockY",
    }),
    alignVertically: new RegisteredAction({
        descKey: "actions.alignment.alignVertically",
        keyboardShortcut: new KeyboardShortcut({ key: "v", alt: true }),
        enumString: "alignVertically",
    }),
    alignHorizontally: new RegisteredAction({
        descKey: "actions.alignment.alignHorizontally",
        keyboardShortcut: new KeyboardShortcut({ key: "h", alt: true }),
        enumString: "alignHorizontally",
    }),
    evenlyDistributeVertically: new RegisteredAction({
        descKey: "actions.alignment.distributeVertically",
        keyboardShortcut: new KeyboardShortcut({ key: "v", shift: true }),
        enumString: "evenlyDistributeVertically",
    }),
    evenlyDistributeHorizontally: new RegisteredAction({
        descKey: "actions.alignment.distributeHorizontally",
        keyboardShortcut: new KeyboardShortcut({ key: "h", shift: true }),
        enumString: "evenlyDistributeHorizontally",
    }),
    flipHorizontal: new RegisteredAction({
        descKey: "actions.alignment.flipHorizontal",
        keyboardShortcut: new KeyboardShortcut({ key: "f", alt: true }),
        enumString: "flipHorizontal",
    }),
    flipVertical: new RegisteredAction({
        descKey: "actions.alignment.flipVertical",
        keyboardShortcut: new KeyboardShortcut({
            key: "f",
            alt: true,
            shift: true,
        }),
        enumString: "flipVertical",
    }),
    swapMarchers: new RegisteredAction({
        descKey: "actions.swap.swap",
        keyboardShortcut: new KeyboardShortcut({ key: "s", control: true }),
        enumString: "swapMarchers",
    }),

    // UI settings
    togglePreviousPagePaths: new RegisteredAction({
        descKey: "actions.ui.togglePreviousPaths",
        toggleOnKey: "actions.ui.showPreviousPaths",
        toggleOffKey: "actions.ui.hidePreviousPaths",
        keyboardShortcut: new KeyboardShortcut({ key: "n" }),
        enumString: "togglePreviousPagePaths",
    }),
    toggleNextPagePaths: new RegisteredAction({
        descKey: "actions.ui.toggleNextPaths",
        toggleOnKey: "actions.ui.showNextPaths",
        toggleOffKey: "actions.ui.hideNextPaths",
        keyboardShortcut: new KeyboardShortcut({ key: "m" }),
        enumString: "toggleNextPagePaths",
    }),
    focusCanvas: new RegisteredAction({
        descKey: "actions.ui.focusCanvas",
        enumString: "focusCanvas",
        keyboardShortcut: new KeyboardShortcut({ key: "c", alt: true }),
    }),
    focusTimeline: new RegisteredAction({
        descKey: "actions.ui.focusTimeline",
        enumString: "focusTimeline",
        keyboardShortcut: new KeyboardShortcut({ key: "t", alt: true }),
    }),

    // Cursor Mode
    applyQuickShape: new RegisteredAction({
        descKey: "actions.shape.applyQuick",
        enumString: "applyQuickShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Enter", shift: true }),
    }),
    createMarcherShape: new RegisteredAction({
        descKey: "actions.shape.create",
        enumString: "createMarcherShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Enter" }),
    }),
    deleteMarcherShape: new RegisteredAction({
        descKey: "actions.shape.delete",
        enumString: "deleteMarcherShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Delete" }),
    }),
    cancelAlignmentUpdates: new RegisteredAction({
        descKey: "actions.alignment.cancelUpdates",
        enumString: "cancelAlignmentUpdates",
        keyboardShortcut: new KeyboardShortcut({ key: "Escape" }),
    }),
    alignmentEventDefault: new RegisteredAction({
        descKey: "actions.cursor.defaultMode",
        enumString: "alignmentEventDefault",
        keyboardShortcut: new KeyboardShortcut({ key: "v" }),
    }),
    alignmentEventLine: new RegisteredAction({
        descKey: "actions.cursor.lineMode",
        enumString: "alignmentEventLine",
        keyboardShortcut: new KeyboardShortcut({ key: "l" }),
    }),

    // Select
    selectAllMarchers: new RegisteredAction({
        descKey: "actions.select.selectAll",
        keyboardShortcut: new KeyboardShortcut({ key: "a", control: true }),
        enumString: "selectAllMarchers",
    }),

    // Shapes
    createCircle: new RegisteredAction({
        descKey: "actions.shape.createCircle",
        keyboardShortcut: new KeyboardShortcut({ key: "o" }),
        enumString: "createCircle",
    }),
} as const;

/**
 * The RegisteredActionsHandler is a component that listens for keyboard shortcuts and button clicks to trigger actions.
 * It is responsible for handling the actions and triggering the appropriate functions.
 *
 * All actions in OpenMarch that can be a keyboard shortcut or a button click should be registered here.
 */
// eslint-disable-next-line max-lines-per-function
function RegisteredActionsHandler() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const setSelectedPage =
        selectedPageContext?.setSelectedPage ?? (() => undefined);
    const { registeredButtonActions } = useRegisteredActionsStore()!;
    const { pages, beats } = useTimingObjects()!;
    const isPlayingContext = useIsPlaying();
    const isPlaying = isPlayingContext?.isPlaying ?? false;
    const setIsPlaying = isPlayingContext?.setIsPlaying ?? (() => {});
    const metronomeStore = useMetronomeStore();
    const toggleMetronome = metronomeStore?.toggleMetronome ?? (() => {});
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const timelineMode = useTimelineMode();
    // Only page mode's "set marchers to the previous or next page" reads these; timeline mode
    // reads the resolver instead (P7.6), so they don't run there
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            timelineMode ? null : selectedPage?.previousPageId,
        ),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            timelineMode ? null : selectedPage?.nextPageId,
        ),
    );
    const { mutate: swapMarchers } = useMutation(
        swapMarchersMutationOptions(queryClient),
    );
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    // "Set marchers to the previous or next page" still writes by page (P7.6) until P8.12
    const { mutateAsync: moveMarchersOnPageAsync } = useMutation(
        moveMarchersOnPageMutationOptions(),
    );
    const { mutate: moveMarchersInTarget } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );
    const { mutate: createMarcherShape } = useCreateMarcherShape();
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});
    const selectedAudioFileContext = useSelectedAudioFile();
    const setSelectedAudioFile =
        selectedAudioFileContext?.setSelectedAudioFile ?? (() => {});
    const databaseReady = useDatabaseReady();
    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const { data: canUndo } = useQuery(canUndoQueryOptions(databaseReady));
    const { data: canRedo } = useQuery(canRedoQueryOptions(databaseReady));
    // The settings are only read when an action runs, so read them then rather than re-rendering
    // (and re-creating every action) on each settings change, such as a timeline zoom save
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const selectionStore = useSelectionStore();
    const setSelectedShapePageIds =
        selectionStore?.setSelectedShapePageIds ?? (() => {});
    const isPerformingHistoryAction = useRef(false);
    const alignmentEventStore = useAlignmentEventStore();
    const resetAlignmentEvent =
        alignmentEventStore?.resetAlignmentEvent ?? (() => {});
    const setAlignmentEvent =
        alignmentEventStore?.setAlignmentEvent ?? (() => {});
    const setAlignmentEventMarchers =
        alignmentEventStore?.setAlignmentEventMarchers ?? (() => {});
    const alignmentEventNewMarcherPages =
        alignmentEventStore?.alignmentEventNewMarcherPages ?? [];
    const alignmentEventMarchers =
        alignmentEventStore?.alignmentEventMarchers ?? [];
    const { mutateAsync: performHistoryAction } = usePerformHistoryAction();
    const {
        mutate: updateSelectedMarchers,
        mutateAsync: updateSelectedMarchersAsync,
    } = useUpdateSelectedMarchersOnSelectedPage();
    const keyboardShortcutDictionary = useRef<{
        [shortcutKeyString: string]: RegisteredActionsEnum;
    }>({});
    const {
        setTitle: setAlertModalTitle,
        setContent: setAlertModalContent,
        setActions: setAlertModalActions,
        setOpen: setAlertModalOpen,
    } = useAlertModalStore();

    /**
     * Get the MarcherPages for the selected marchers on the selected page.
     */
    const getSelectedMarcherPages = useCallback(() => {
        if (timelineMode) {
            // Timeline mode (UI-9 Editing, P8.15): the tools start from the resolver's positions
            // where the selection edits (the selected timeline's end, or homes at beat 0), for
            // every selected marcher. marcher_pages isn't read: its rows can be stale or missing.
            // A refused selection gives nothing here; the write (`updateCoordinates` or
            // `useUpdateSelectedMarchers`) says why, once.
            if (selectedMarchers.length === 0) return [];
            const plan = planCanvasEdit();
            if (!plan.ok) return [];
            try {
                return timelineCoordinateRecords(
                    plan.beat,
                    selectedMarchers.map((marcher) => marcher.id),
                );
            } catch (e) {
                toastTimelineError(e);
                return [];
            }
        }
        if (!selectedPage) {
            console.error("No selected page");
            return [];
        }
        if (!marcherPagesLoaded) {
            console.error("Marcher pages not loaded");
            return [];
        }

        const output = selectedMarchers.map(
            (marcher) => marcherPages[marcher.id],
        );
        return output;
    }, [
        marcherPages,
        marcherPagesLoaded,
        selectedMarchers,
        selectedPage,
        timelineMode,
    ]);

    const selectedMarcherCount = selectedMarchers.length;
    /**
     * Writes new coordinates for the marchers: `marcher_pages` on the selected page in page mode
     * (unchanged); in timeline mode, the endings in the selected timeline or the homes, as the
     * selection allows (UI-9 Editing, P8.15). A refusal is a toast when marchers are selected.
     */
    const updateCoordinates = useCallback(
        (changes: ModifiedMarcherPageArgs[]) => {
            if (!timelineMode) {
                updateMarcherPages(changes);
                return;
            }
            // The changes' page ids can be left over from an earlier render and are ignored.
            // This plans again after `getSelectedMarcherPages` planned the read. The tools call
            // both synchronously in one action, so the selection can't change in between and
            // both plans agree; passing the plan through would touch every tool's call.
            const plan = planCanvasEdit();
            if (!plan.ok) {
                if (changes.length > 0 || selectedMarcherCount > 0)
                    toastTimelineError(plan.error);
                return;
            }
            if (changes.length === 0) return;
            snapIsolatedPlayheadToEnd();
            moveMarchersInTarget({
                target: plan.target,
                moves: toTimelineMoves(changes),
            });
        },
        [
            timelineMode,
            updateMarcherPages,
            selectedMarcherCount,
            moveMarchersInTarget,
        ],
    );

    /**
     * "Set all or selected marchers to the previous or next page" in either mode
     * (`setMarchersToNeighborPage`; timeline mode is P7.6).
     */
    const runNeighborPageAction = useCallback(
        (direction: NeighborPageDirection, scope: NeighborPageScope) => {
            if (!selectedPage || !databaseReady || !pages || pages.length === 0)
                return;
            void setMarchersToNeighborPage({
                timelineMode,
                direction,
                scope,
                selectedPage,
                pages,
                selectedMarcherIds: (
                    selectedMarchersContext?.selectedMarchers ?? []
                ).map((m) => m.id),
                neighborMarcherPages:
                    direction === "previous"
                        ? previousMarcherPages
                        : nextMarcherPages,
                writePages: updateMarcherPages,
                writeTimeline: moveMarchersOnPageAsync,
                notify: toast,
                t: (key, params) => t(key, params),
            });
        },
        [
            selectedPage,
            databaseReady,
            pages,
            timelineMode,
            selectedMarchersContext,
            previousMarcherPages,
            nextMarcherPages,
            updateMarcherPages,
            moveMarchersOnPageAsync,
            t,
        ],
    );

    // Arrow movement defaults
    const isUpdatingDirection = useRef(false);
    const snap = useRef(true);
    const distance = useRef(1);

    /**
     * Trigger a RegisteredAction.
     */
    const triggerAction = useCallback(
        // eslint-disable-next-line max-lines-per-function
        (action: RegisteredActionsEnum) => {
            const { uiSettings } = useUiSettingsStore.getState();
            let isElectronAction = true;

            // UI-11: anything but the transport puts a held preview frame back on the playhead, so
            // edits start from the positions they change
            if (!TRANSPORT_ACTIONS.has(action)) {
                const timelineSelection = useTimelineSelectionStore.getState();
                if (timelineSelection.playback === null)
                    timelineSelection.clearCursor();
            }

            // Check if this is an electron action
            switch (action) {
                case RegisteredActionsEnum.launchLoadFileDialogue:
                    void window.electron.databaseLoad();
                    break;
                case RegisteredActionsEnum.launchSaveFileDialogue:
                    // Set alert modal with help text to confirm the user wants to save a copy
                    setAlertModalTitle("fileTab.saveFile");
                    setAlertModalContent(
                        <T keyName="fileTab.saveCopyDialogDescription" />,
                    );
                    setAlertModalActions(
                        <div className="flex justify-end gap-16">
                            <AlertDialogAction>
                                <Button
                                    variant="primary"
                                    onClick={(e) => {
                                        e.preventDefault();

                                        setAlertModalContent(
                                            <div className="my-16 flex h-full w-full flex-col items-center justify-center gap-8 self-center">
                                                <CircleNotchIcon
                                                    size={32}
                                                    aria-label={t(
                                                        "fileTab.saveSpinnerText",
                                                    )}
                                                    className="text-text my-8 animate-spin"
                                                />
                                                <T keyName="fileTab.saveSpinnerText" />
                                            </div>,
                                        );

                                        setAlertModalActions(undefined);

                                        window.electron
                                            .databaseSave()
                                            .then((response) => {
                                                setAlertModalOpen(false);

                                                // User canceled dialog
                                                if (response === 0) {
                                                    return;
                                                } else if (response === 200) {
                                                    toast.success(
                                                        t(
                                                            "fileTab.toasts.success",
                                                        ),
                                                    );
                                                } else {
                                                    toast.error(
                                                        t(
                                                            "fileTab.toasts.error",
                                                        ),
                                                    );
                                                }
                                            })
                                            .catch((err: Error) => {
                                                setAlertModalOpen(false);
                                                toast.error(
                                                    `${t("fileTab.toasts.error")}. Error ${err.message}`,
                                                );
                                            });
                                    }}
                                >
                                    <T keyName="fileTab.saveFile" />
                                </Button>
                            </AlertDialogAction>
                            <AlertDialogCancel>
                                <Button
                                    variant="secondary"
                                    onClick={() => setAlertModalOpen(false)}
                                >
                                    <T keyName="fileTab.saveFileCancel" />
                                </Button>
                            </AlertDialogCancel>
                        </div>,
                    );
                    setAlertModalOpen(true);
                    break;
                case RegisteredActionsEnum.launchNewFileDialogue:
                    void requestOpenNewShowDialog();
                    break;
                case RegisteredActionsEnum.launchInsertAudioFileDialogue:
                    window.electron
                        .databaseIsReady()
                        .then(async (dbReady) => {
                            if (!dbReady) {
                                toast.error(
                                    "No file is open. Create or open a show first.",
                                );
                                return;
                            }

                            const response =
                                await window.electron.launchInsertAudioFileDialogue();
                            if (response?.success) {
                                AudioFile.getSelectedAudioFile().then(
                                    (audioFile) => {
                                        const selectedAudioFileWithoutAudio = {
                                            ...audioFile,
                                            data: undefined,
                                        };
                                        setSelectedAudioFile(
                                            selectedAudioFileWithoutAudio,
                                        );
                                    },
                                );
                                window.dispatchEvent(
                                    new CustomEvent("audioFilesUpdated"),
                                );
                                toast.success(
                                    "Audio file uploaded successfully",
                                );
                            } else {
                                const errorMessage =
                                    response?.error?.message ||
                                    "Failed to upload audio file";
                                toast.error(errorMessage);
                                console.error(
                                    "Error uploading audio file:",
                                    response?.error,
                                );
                            }
                        })
                        .catch((error) => {
                            console.error(
                                "Error checking database or uploading audio file:",
                                error,
                            );
                            toast.error(
                                error instanceof Error
                                    ? error.message
                                    : "Failed to upload audio file",
                            );
                        });
                    break;
                case RegisteredActionsEnum.launchImportMusicXmlFileDialogue:
                    break;
                default:
                    isElectronAction = false;
                    break;
            }

            if (isElectronAction) return;
            if (!selectedPage) {
                console.error("No selected page");
                return;
            }
            if (!fieldProperties) {
                console.error("No field properties");
                return;
            }
            if (!marcherPagesLoaded) {
                console.error("Marcher pages not loaded");
                return;
            }
            switch (action) {
                /****************** Navigation and playback ******************/
                case RegisteredActionsEnum.launchLoadFileDialogue:
                case RegisteredActionsEnum.launchSaveFileDialogue:
                case RegisteredActionsEnum.launchNewFileDialogue:
                case RegisteredActionsEnum.launchInsertAudioFileDialogue:
                case RegisteredActionsEnum.launchImportMusicXmlFileDialogue:
                    break;
                case RegisteredActionsEnum.performUndo:
                    if (canUndo) {
                        if (!isPerformingHistoryAction.current) {
                            isPerformingHistoryAction.current = true;
                            void performHistoryAction("undo").finally(() => {
                                isPerformingHistoryAction.current = false;
                            });
                        }
                    } else toast.warning(t("actions.edit.noUndoAvailable"));
                    break;
                case RegisteredActionsEnum.performRedo:
                    if (canRedo) {
                        if (!isPerformingHistoryAction.current) {
                            isPerformingHistoryAction.current = true;
                            void performHistoryAction("redo").finally(() => {
                                isPerformingHistoryAction.current = false;
                            });
                        }
                    } else toast.warning(t("actions.edit.noRedoAvailable"));
                    break;
                /****************** Navigation and playback ******************/
                case RegisteredActionsEnum.nextPage: {
                    if (!databaseReady || !pages || pages.length === 0) break;
                    // UI-9: navigation moves the playhead to a flag and selects that page
                    if (timelineMode) {
                        if (!isPlaying)
                            navigateTimelinePages(pages, "next-page");
                        break;
                    }
                    const nextPage = getNextPage(selectedPage, pages);
                    if (nextPage && !isPlaying) setSelectedPage(nextPage);
                    break;
                }
                case RegisteredActionsEnum.lastPage: {
                    if (!databaseReady || !pages || pages.length === 0) break;
                    if (timelineMode) {
                        if (!isPlaying)
                            navigateTimelinePages(pages, "last-page");
                        break;
                    }
                    const lastPage = pages[pages.length - 1];
                    if (lastPage && !isPlaying) setSelectedPage(lastPage);
                    break;
                }
                case RegisteredActionsEnum.previousPage: {
                    if (!databaseReady || !pages || pages.length === 0) break;
                    if (timelineMode) {
                        if (!isPlaying)
                            navigateTimelinePages(pages, "previous-page");
                        break;
                    }
                    const previousPage = getPreviousPage(selectedPage, pages);
                    if (previousPage && !isPlaying)
                        setSelectedPage(previousPage);
                    break;
                }
                case RegisteredActionsEnum.firstPage: {
                    if (!databaseReady || !pages || pages.length === 0) break;
                    if (timelineMode) {
                        if (!isPlaying)
                            navigateTimelinePages(pages, "first-page");
                        break;
                    }
                    const firstPage = pages[0];
                    if (firstPage && !isPlaying) setSelectedPage(firstPage);
                    break;
                }
                case RegisteredActionsEnum.togglePlayFromStart: {
                    // UI-11 From start: Play previews the window from the start flag
                    if (!timelineMode) break;
                    useTimelineSelectionStore.getState().setPlayFromStart();
                    break;
                }
                case RegisteredActionsEnum.playPause: {
                    if (!databaseReady || !pages || pages.length === 0) break;
                    // UI-11 Play: plays on, or previews the window with From start on
                    if (timelineMode) {
                        toggleTimelinePlayback({
                            isPlaying,
                            showEndBeat: beats.length,
                            setIsPlaying,
                        });
                        break;
                    }
                    const nextPage = getNextPage(selectedPage, pages);
                    if (nextPage) setIsPlaying(!isPlaying);
                    break;
                }
                case RegisteredActionsEnum.stopPlayback: {
                    // UI-11 Stop: back to the playhead (timeline mode only)
                    if (!databaseReady || !timelineMode) break;
                    stopTimelinePlayback({ isPlaying, setIsPlaying });
                    break;
                }
                case RegisteredActionsEnum.toggleMetronome: {
                    toggleMetronome();
                    break;
                }

                /****************** Batch Editing ******************/
                case RegisteredActionsEnum.setAllMarchersToPreviousPage:
                    runNeighborPageAction("previous", "all");
                    break;
                case RegisteredActionsEnum.setSelectedMarchersToPreviousPage:
                    runNeighborPageAction("previous", "selected");
                    break;
                case RegisteredActionsEnum.setAllMarchersToNextPage:
                    runNeighborPageAction("next", "all");
                    break;
                case RegisteredActionsEnum.setSelectedMarchersToNextPage:
                    runNeighborPageAction("next", "selected");
                    break;

                /******************* Marcher Movement ******************/
                case RegisteredActionsEnum.moveSelectedMarchersUp: {
                    if (isUpdatingDirection.current) return;
                    isUpdatingDirection.current = true;
                    const updatedPagesArray = CoordinateActions.moveMarchersXY({
                        marcherPages: getSelectedMarcherPages(),
                        direction: "up",
                        distance: distance.current,
                        snap: snap.current,
                        fieldProperties: fieldProperties,
                        snapDenominatorX: 1.0 / distance.current,
                        snapDenominatorY: 1.0 / distance.current,
                    });
                    updateSelectedMarchersAsync(() => updatedPagesArray)
                        // The mutation toasts a failure or refusal itself
                        .catch(() => undefined)
                        .finally(() => {
                            isUpdatingDirection.current = false;
                        });
                    break;
                }
                case RegisteredActionsEnum.moveSelectedMarchersDown: {
                    if (isUpdatingDirection.current) return;
                    isUpdatingDirection.current = true;
                    const updatedPagesArray = CoordinateActions.moveMarchersXY({
                        marcherPages: getSelectedMarcherPages(),
                        direction: "down",
                        distance: distance.current,
                        snap: snap.current,
                        fieldProperties: fieldProperties,
                        snapDenominatorX: 1.0 / distance.current,
                        snapDenominatorY: 1.0 / distance.current,
                    });
                    updateSelectedMarchersAsync(() => updatedPagesArray)
                        // The mutation toasts a failure or refusal itself
                        .catch(() => undefined)
                        .finally(() => {
                            isUpdatingDirection.current = false;
                        });
                    break;
                }
                case RegisteredActionsEnum.moveSelectedMarchersLeft: {
                    if (isUpdatingDirection.current) return;
                    isUpdatingDirection.current = true;
                    const updatedPagesArray = CoordinateActions.moveMarchersXY({
                        marcherPages: getSelectedMarcherPages(),
                        direction: "left",
                        distance: distance.current,
                        snap: snap.current,
                        fieldProperties: fieldProperties,
                        snapDenominatorX: 1.0 / distance.current,
                        snapDenominatorY: 1.0 / distance.current,
                    });
                    updateSelectedMarchersAsync(() => updatedPagesArray)
                        // The mutation toasts a failure or refusal itself
                        .catch(() => undefined)
                        .finally(() => {
                            isUpdatingDirection.current = false;
                        });
                    break;
                }
                case RegisteredActionsEnum.moveSelectedMarchersRight: {
                    if (isUpdatingDirection.current) return;
                    isUpdatingDirection.current = true;
                    const updatedPagesArray = CoordinateActions.moveMarchersXY({
                        marcherPages: getSelectedMarcherPages(),
                        direction: "right",
                        distance: distance.current,
                        snap: snap.current,
                        fieldProperties: fieldProperties,
                        snapDenominatorX: 1.0 / distance.current,
                        snapDenominatorY: 1.0 / distance.current,
                    });
                    updateSelectedMarchersAsync(() => updatedPagesArray)
                        // The mutation toasts a failure or refusal itself
                        .catch(() => undefined)
                        .finally(() => {
                            isUpdatingDirection.current = false;
                        });
                    break;
                }

                /****************** Alignment ******************/
                case RegisteredActionsEnum.snapToNearestCustomFraction: {
                    const safeDenominatorX =
                        uiSettings.coordinateRounding?.nearestXSteps === 0 ||
                        uiSettings.coordinateRounding?.nearestXSteps ===
                            undefined
                            ? 0
                            : 1 / uiSettings.coordinateRounding?.nearestXSteps;
                    const safeDenominatorY =
                        uiSettings.coordinateRounding?.nearestYSteps === 0 ||
                        uiSettings.coordinateRounding?.nearestYSteps ===
                            undefined
                            ? 0
                            : 1 / uiSettings.coordinateRounding?.nearestYSteps;
                    const roundedCoords = CoordinateActions.getRoundCoordinates(
                        {
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties: fieldProperties,
                            denominatorX: safeDenominatorX,
                            denominatorY: safeDenominatorY,
                            xAxis: !uiSettings.lockX,
                            yAxis: !uiSettings.lockY,
                        },
                    );
                    updateCoordinates(roundedCoords);
                    break;
                }
                case RegisteredActionsEnum.lockX:
                    setUiSettings(
                        { ...uiSettings, lockX: !uiSettings.lockX },
                        "lockX",
                    );
                    break;
                case RegisteredActionsEnum.lockY:
                    setUiSettings(
                        { ...uiSettings, lockY: !uiSettings.lockY },
                        "lockY",
                    );
                    break;
                case RegisteredActionsEnum.alignVertically: {
                    const alignedCoords = CoordinateActions.alignVertically({
                        marcherPages: getSelectedMarcherPages(),
                    });
                    updateCoordinates(alignedCoords);
                    break;
                }
                case RegisteredActionsEnum.alignHorizontally: {
                    const alignedCoords = CoordinateActions.alignHorizontally({
                        marcherPages: getSelectedMarcherPages(),
                    });
                    updateCoordinates(alignedCoords);
                    break;
                }
                case RegisteredActionsEnum.evenlyDistributeVertically: {
                    const distributedCoords =
                        CoordinateActions.evenlyDistributeVertically({
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties,
                        });
                    updateCoordinates(distributedCoords);
                    break;
                }
                case RegisteredActionsEnum.evenlyDistributeHorizontally: {
                    const distributedCoords =
                        CoordinateActions.evenlyDistributeHorizontally({
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties,
                        });
                    updateCoordinates(distributedCoords);
                    break;
                }
                case RegisteredActionsEnum.flipHorizontal: {
                    const flippedCoords = CoordinateActions.flipHorizontal(
                        getSelectedMarcherPages(),
                    );
                    updateCoordinates(flippedCoords);
                    break;
                }
                case RegisteredActionsEnum.flipVertical: {
                    const flippedCoords = CoordinateActions.flipVertical(
                        getSelectedMarcherPages(),
                    );
                    updateCoordinates(flippedCoords);
                    break;
                }
                case RegisteredActionsEnum.swapMarchers: {
                    if (selectedMarchers.length !== 2) {
                        console.error(
                            "Can only swap 2 marchers. Selected marchers:",
                            selectedMarchers,
                        );
                        toast.error(t("actions.swap.mustSelectTwo"));
                        return;
                    }
                    if (timelineMode) {
                        // Timeline mode: each marcher takes the other's position on this page
                        const pair = getSelectedMarcherPages();
                        if (pair.length !== 2) {
                            // Refused by the selection: say why, as the other tools do
                            updateCoordinates([]);
                            return;
                        }
                        updateCoordinates([
                            { ...pair[0], x: pair[1].x, y: pair[1].y },
                            { ...pair[1], x: pair[0].x, y: pair[0].y },
                        ]);
                        break;
                    }
                    swapMarchers({
                        pageId: selectedPage.id,
                        marcher1Id: selectedMarchers[0].id,
                        marcher2Id: selectedMarchers[1].id,
                    });
                    break;
                }

                /****************** UI settings ******************/
                case RegisteredActionsEnum.toggleNextPagePaths:
                    setUiSettings({
                        ...uiSettings,
                        nextPaths: !uiSettings.nextPaths,
                    });
                    break;
                case RegisteredActionsEnum.togglePreviousPagePaths:
                    setUiSettings({
                        ...uiSettings,
                        previousPaths: !uiSettings.previousPaths,
                    });
                    break;
                case RegisteredActionsEnum.focusCanvas:
                    setUiSettings({
                        ...uiSettings,
                        focussedComponent: "canvas",
                    });
                    break;
                case RegisteredActionsEnum.focusTimeline:
                    setUiSettings({
                        ...uiSettings,
                        focussedComponent: "timeline",
                    });
                    break;

                /****************** Cursor Mode ******************/
                case RegisteredActionsEnum.cancelAlignmentUpdates: {
                    if (alignmentEventMarchers.length > 0) {
                        setSelectedMarchers(alignmentEventMarchers);
                        resetAlignmentEvent();
                    } else {
                        // Deselect all shapes and marchers
                        setSelectedMarchers([]);
                        setSelectedShapePageIds([]);
                    }
                    break;
                }
                case RegisteredActionsEnum.applyQuickShape: {
                    updateCoordinates(
                        alignmentEventNewMarcherPages.map((marcherPage) => ({
                            marcher_id: marcherPage.marcher_id,
                            page_id: marcherPage.page_id,
                            x: marcherPage.x as number,
                            y: marcherPage.y as number,
                            notes: marcherPage.notes || undefined,
                        })),
                    );
                    resetAlignmentEvent();
                    break;
                }
                case RegisteredActionsEnum.createMarcherShape: {
                    if (timelineMode) {
                        // Page shapes write shape pages and marcher_pages (P7.11). The line's
                        // positions can still be applied, so the alignment stays open.
                        toastTimelineError(
                            new TimelineWriteError(
                                "E-ARGS",
                                PAGE_SHAPES_TIMELINE_MESSAGE,
                            ),
                        );
                        break;
                    }
                    const firstMarcherPage = alignmentEventNewMarcherPages[0];
                    const lastMarcherPage =
                        alignmentEventNewMarcherPages[
                            alignmentEventNewMarcherPages.length - 1
                        ];
                    const marcherIds = alignmentEventNewMarcherPages.map(
                        (marcherPage) => marcherPage.marcher_id,
                    );
                    createMarcherShape({
                        marcherIds,
                        start: firstMarcherPage,
                        end: lastMarcherPage,
                        pageId: selectedPage.id,
                    });
                    resetAlignmentEvent();
                    break;
                }
                case RegisteredActionsEnum.alignmentEventDefault: {
                    resetAlignmentEvent();
                    break;
                }
                case RegisteredActionsEnum.alignmentEventLine: {
                    if (selectedMarchers.length < 2) {
                        console.error(
                            "Not enough marchers selected to create a line. Need at least 2 marchers selected.",
                        );
                        break;
                    }
                    setAlignmentEvent("line");
                    setAlignmentEventMarchers(selectedMarchers);
                    setSelectedMarchers([]);
                    break;
                }

                /****************** Select ******************/
                case RegisteredActionsEnum.selectAllMarchers: {
                    const canvas = window.canvas as OpenMarchCanvas | undefined;
                    if (!canvas) {
                        break;
                    }

                    canvas.setActiveObjects(canvas.getCanvasMarchers());
                    break;
                }

                /****************** Shapes ******************/
                case RegisteredActionsEnum.createCircle: {
                    updateSelectedMarchers(({ currentCoordinates }) => {
                        const updatedCoordinates = createCircle(
                            currentCoordinates.map((mp) => ({
                                id: mp.marcher_id,
                                x: mp.x,
                                y: mp.y,
                            })),
                            {
                                centerX: 0,
                                centerY: 0,
                                radius: 10,
                            },
                        );

                        return updatedCoordinates.map((coordinate) => ({
                            marcher_id: coordinate.id,
                            x: coordinate.x,
                            y: coordinate.y,
                        }));
                    });
                    break;
                }

                default:
                    console.error(`No action registered for "${action}"`);
                    return;
            }
        },
        [
            selectedPage,
            fieldProperties,
            marcherPagesLoaded,
            setSelectedAudioFile,
            canUndo,
            t,
            canRedo,
            setUiSettings,
            performHistoryAction,
            pages,
            beats,
            isPlaying,
            setSelectedPage,
            setIsPlaying,
            toggleMetronome,
            previousMarcherPages,
            updateMarcherPages,
            selectedMarchers,
            nextMarcherPages,
            getSelectedMarcherPages,
            updateSelectedMarchersAsync,
            swapMarchers,
            alignmentEventMarchers,
            setSelectedMarchers,
            resetAlignmentEvent,
            setSelectedShapePageIds,
            alignmentEventNewMarcherPages,
            createMarcherShape,
            setAlignmentEvent,
            setAlignmentEventMarchers,
            updateSelectedMarchers,
            updateCoordinates,
            runNeighborPageAction,
            timelineMode,
        ],
    );

    /**
     * Create a dictionary of keyboard shortcuts to actions. This is used to trigger actions from keyboard shortcuts.
     */
    useEffect(() => {
        const tempDict: { [shortcutKeyString: string]: RegisteredActionsEnum } =
            {};
        Object.keys(RegisteredActionsEnum).forEach((action) => {
            const keyboardShortcut =
                RegisteredActionsObjects[
                    action as RegisteredActionsEnum
                ].keyboardShortcut?.toString() || undefined;
            // No keyboard shortcut for this action
            if (!keyboardShortcut) return;
            // Check for duplicate keyboard shortcuts
            if (tempDict[keyboardShortcut] !== undefined)
                console.error(
                    `Duplicate keyboard shortcut for \`${keyboardShortcut}\` \nAction: \`${action}\` and \`${tempDict[keyboardShortcut]}\``,
                );
            tempDict[keyboardShortcut] = action as RegisteredActionsEnum;
        });
        keyboardShortcutDictionary.current = tempDict;
    }, []);

    /**
     * Handles the keyboard shortcuts for entire react side of the application.
     */
    const handleKeyDown = useCallback(
        // eslint-disable-next-line max-lines-per-function
        (e: KeyboardEvent) => {
            const { uiSettings } = useUiSettingsStore.getState();
            if (
                uiSettings.focussedComponent === "canvas" &&
                !document.activeElement?.matches(
                    "input, textarea, select, [contenteditable]",
                ) &&
                document.activeElement?.id !== "sentry-feedback" &&
                document.activeElement?.id !== "__tolgee_dev_tools"
            ) {
                // UI-14 round-2 review: Enter and the arrows on the timeline's move controls
                // are theirs; Space still plays
                if (isTimelineOwnKey(e, document.activeElement)) return;
                // Check the key code and convert it to a key string
                // This must happen rather than using e.key because e.key changes on MacOS with the option key
                const code = e.code;
                let key = e.key;

                // These do not change with the option key
                const ignoredKeys = new Set([
                    "Shift",
                    "Control",
                    "Alt",
                    "Meta",
                    " ",
                    "Enter",
                    "Escape",
                    "ArrowUp",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowRight",
                ]);

                // Special handling for WASD/Arrow keys; never on a timeline move control, where
                // Ctrl+S and Ctrl+A keep only their own shortcut (code review)
                if (
                    !skipsAppNudge(e, document.activeElement) &&
                    (code === "KeyW" ||
                        code === "KeyA" ||
                        code === "KeyS" ||
                        code === "KeyD" ||
                        code === "ArrowUp" ||
                        code === "ArrowDown" ||
                        code === "ArrowLeft" ||
                        code === "ArrowRight")
                ) {
                    e.preventDefault();

                    // toggle snapping
                    snap.current = !e.altKey && !e.shiftKey;

                    // set distance based on modifiers
                    if (e.metaKey && e.shiftKey && !code.includes("Key")) {
                        distance.current = 0.1;
                    } else if (e.metaKey && !code.includes("Key")) {
                        distance.current = 4;
                    } else if (e.shiftKey) {
                        distance.current = 0.25;
                    } else if (
                        code === "ArrowUp" ||
                        code === "ArrowDown" ||
                        code === "KeyW" ||
                        code === "KeyS"
                    ) {
                        distance.current =
                            uiSettings.coordinateRounding?.nearestYSteps || 1;
                    } else if (
                        code === "ArrowLeft" ||
                        code === "ArrowRight" ||
                        code === "KeyA" ||
                        code === "KeyD"
                    ) {
                        distance.current =
                            uiSettings.coordinateRounding?.nearestXSteps || 1;
                    }

                    // Prevent meta+WASD
                    if (!(e.metaKey && code.includes("Key"))) {
                        // Trigger the action based on the key code
                        switch (code) {
                            case "KeyW":
                            case "ArrowUp":
                                triggerAction(
                                    RegisteredActionsEnum.moveSelectedMarchersUp,
                                );
                                break;
                            case "KeyA":
                            case "ArrowLeft":
                                triggerAction(
                                    RegisteredActionsEnum.moveSelectedMarchersLeft,
                                );
                                break;
                            case "KeyS":
                            case "ArrowDown":
                                triggerAction(
                                    RegisteredActionsEnum.moveSelectedMarchersDown,
                                );
                                break;
                            case "KeyD":
                            case "ArrowRight":
                                triggerAction(
                                    RegisteredActionsEnum.moveSelectedMarchersRight,
                                );
                                break;
                        }
                    }
                }

                // Standard RegisteredAction handling
                if (code.includes("Key")) {
                    key = code.replace("Key", "");
                } else if (code.includes("Digit")) {
                    key = code.replace("Digit", "");
                } else if (!ignoredKeys.has(key)) {
                    console.error(
                        `RegisteredAction Warning: No keyCode handler found for "${code}".`,
                        "This key may not work as expected if using as a registered action shortcut.",
                    );
                    key = e.key;
                }
                const keyboardAction = new KeyboardShortcut({
                    key,
                    control: e.ctrlKey || e.metaKey,
                    alt: e.altKey,
                    shift: e.shiftKey,
                });
                const keyString = keyboardAction.toString();
                if (keyboardShortcutDictionary.current[keyString]) {
                    triggerAction(
                        keyboardShortcutDictionary.current[keyString],
                    );
                    e.preventDefault();
                }
            } else if (e.key === "Escape") {
                setUiSettings({
                    ...uiSettings,
                    focussedComponent: "canvas",
                });
            }
        },
        [setUiSettings, triggerAction],
    );

    /**
     * register the keyboard listener to the window to listen for keyboard shortcuts.
     */
    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleKeyDown]);

    /**
     * Register the button refs for the keyboard shortcuts
     */
    useEffect(() => {
        const assignClickHandlers = () => {
            registeredButtonActions.forEach((buttonAction) => {
                if (!buttonAction.buttonRef.current) {
                    // console.error(
                    //     `No button ref for ${buttonAction.registeredAction}`
                    // );
                    return;
                }
                buttonAction.buttonRef.current.onclick = () =>
                    triggerAction(buttonAction.registeredAction);
            });
        };

        // Use setTimeout to ensure button refs are set after components mount
        const timeoutId = setTimeout(assignClickHandlers, 0);

        return () => clearTimeout(timeoutId);
    }, [registeredButtonActions, triggerAction]);

    return <></>; // empty fragment
}

export default RegisteredActionsHandler;
