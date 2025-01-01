import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { usePageStore } from "@/stores/PageStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useCallback, useEffect, useRef } from "react";
import * as CoordinateActions from "./CoordinateActions";
import MarcherPage from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import Measure from "@/global/classes/Measure";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { toast } from "sonner";

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

    // Batch editing
    setAllMarchersToPreviousPage = "setAllMarchersToPreviousPage",
    setSelectedMarchersToPreviousPage = "setSelectedMarchersToPreviousPage",
    setAllMarchersToNextPage = "setAllMarchersToNextPage",
    setSelectedMarchersToNextPage = "setSelectedMarchersToNextPage",

    // Alignment
    snapToNearestWhole = "snapToNearestWhole",
    lockX = "lockX",
    lockY = "lockY",
    alignVertically = "alignVertically",
    alignHorizontally = "alignHorizontally",
    evenlyDistributeHorizontally = "evenlyDistributeHorizontally",
    evenlyDistributeVertically = "evenlyDistributeVertically",
    swapMarchers = "swapMarchers",

    // UI settings
    toggleNextPagePaths = "toggleNextPagePaths",
    togglePreviousPagePaths = "togglePreviousPagePaths",

    // Cursor Mode
    applyQuickShape = "applyQuickShape",
    createMarcherShape = "createMarcherShape",
    deleteMarcherShape = "deleteMarcherShape",
    cancelAlignmentUpdates = "cancelAlignmentUpdates",
    alignmentEventDefault = "alignmentEventDefault",
    alignmentEventLine = "alignmentEventLine",

    // Select
    selectAllMarchers = "selectAllMarchers",
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
    /** The description of the action. Also used for the instructional string
     * E.g. "Lock the X axis" */
    readonly desc: string;
    /** The string to display in the UI for the keyboard shortcut. Eg. "Snap to nearest whole [Shift + X]" */
    readonly instructionalString: string;
    /** Instructional string to toggle on the given action (only relevant for toggle-based actions)
     * E.g. "Enable X axis [Shift + X]" */
    readonly instructionalStringToggleOn: string;
    /** Instructional string to toggle off the given action (only relevant for toggle-based actions)
     * E.g. "Lock X axis [Shift + X]" */
    readonly instructionalStringToggleOff: string;
    /** The string representation of the action. E.g. "lockX" */
    readonly enumString: string;

    /**
     *
     * @param keyboardShortcut The keyboard shortcut to trigger the action. Optional.
     * @param desc The description of the action. Also used for the instructional string. "Lock the X axis"
     * @param toggleOnStr The string to display in the UI for the keyboard shortcut when the action is toggled on. Defaults to the desc
     * @param toggleOffStr The string to display in the UI for the keyboard shortcut when the action is toggled off. Defaults to the desc
     */
    constructor({
        keyboardShortcut,
        desc,
        toggleOnStr,
        toggleOffStr,
        enumString,
    }: {
        keyboardShortcut?: KeyboardShortcut;
        desc: string;
        action?: () => any;
        toggleOnStr?: string;
        toggleOffStr?: string;
        enumString: string;
    }) {
        this.keyboardShortcut = keyboardShortcut;
        this.desc = desc;
        const keyString = keyboardShortcut
            ? ` [${keyboardShortcut.toString()}]`
            : "";
        this.instructionalString = this.desc + keyString;
        this.instructionalStringToggleOn = toggleOnStr
            ? toggleOnStr + keyString
            : this.instructionalString;
        this.instructionalStringToggleOff = toggleOffStr
            ? toggleOffStr + keyString
            : this.instructionalString;

        if (
            !Object.values(RegisteredActionsEnum).includes(
                enumString as RegisteredActionsEnum,
            )
        )
            console.error(`Invalid enumString: ${enumString}. This should be a RegisteredActionsEnum value.
        \nRegistered action for "${desc}" will not be registered to buttons.`);
        this.enumString = enumString;
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
 */
export const RegisteredActionsObjects: {
    [key in RegisteredActionsEnum]: RegisteredAction;
} = {
    // Electron interactions
    launchLoadFileDialogue: new RegisteredAction({
        desc: "Launch load file dialogue",
        enumString: "launchLoadFileDialogue",
    }),
    launchSaveFileDialogue: new RegisteredAction({
        desc: "Launch save file dialogue",
        enumString: "launchSaveFileDialogue",
    }),
    launchNewFileDialogue: new RegisteredAction({
        desc: "Launch new file dialogue",
        enumString: "launchNewFileDialogue",
    }),
    launchInsertAudioFileDialogue: new RegisteredAction({
        desc: "Load new audio file into the show",
        enumString: "launchInsertAudioFileDialogue",
    }),
    launchImportMusicXmlFileDialogue: new RegisteredAction({
        desc: "Import MusicXML file to get measures",
        enumString: "launchImportMusicXmlFileDialogue",
    }),
    performUndo: new RegisteredAction({
        desc: "Perform undo",
        enumString: "performUndo",
    }),
    performRedo: new RegisteredAction({
        desc: "Perform redo",
        enumString: "performRedo",
    }),

    // Navigation and playback
    nextPage: new RegisteredAction({
        desc: "Next page",
        keyboardShortcut: new KeyboardShortcut({ key: "e" }),
        enumString: "nextPage",
    }),
    lastPage: new RegisteredAction({
        desc: "Last page",
        keyboardShortcut: new KeyboardShortcut({ key: "e", shift: true }),
        enumString: "lastPage",
    }),
    previousPage: new RegisteredAction({
        desc: "Previous page",
        keyboardShortcut: new KeyboardShortcut({ key: "q" }),
        enumString: "previousPage",
    }),
    firstPage: new RegisteredAction({
        desc: "First page",
        keyboardShortcut: new KeyboardShortcut({ key: "q", shift: true }),
        enumString: "firstPage",
    }),
    playPause: new RegisteredAction({
        desc: "Play or pause",
        toggleOnStr: "Play",
        toggleOffStr: "Pause",
        keyboardShortcut: new KeyboardShortcut({ key: " " }),
        enumString: "playPause",
    }),

    // Batch editing
    setAllMarchersToPreviousPage: new RegisteredAction({
        desc: "Set all marcher coordinates to previous page",
        keyboardShortcut: new KeyboardShortcut({
            key: "p",
            shift: true,
            control: true,
        }),
        enumString: "setAllMarchersToPreviousPage",
    }),
    setSelectedMarchersToPreviousPage: new RegisteredAction({
        desc: "Set selected marcher(s) coordinates to previous page",
        keyboardShortcut: new KeyboardShortcut({ key: "p", shift: true }),
        enumString: "setSelectedMarchersToPreviousPage",
    }),
    setAllMarchersToNextPage: new RegisteredAction({
        desc: "Set all marcher coordinates to next page",
        keyboardShortcut: new KeyboardShortcut({
            key: "n",
            shift: true,
            control: true,
        }),
        enumString: "setAllMarchersToNextPage",
    }),
    setSelectedMarchersToNextPage: new RegisteredAction({
        desc: "Set selected marcher(s) coordinates to next page",
        keyboardShortcut: new KeyboardShortcut({ key: "n", shift: true }),
        enumString: "setSelectedMarchersToNextPage",
    }),

    // Alignment
    snapToNearestWhole: new RegisteredAction({
        desc: "Snap to nearest whole",
        keyboardShortcut: new KeyboardShortcut({ key: "1" }),
        enumString: "snapToNearestWhole",
    }),
    lockX: new RegisteredAction({
        desc: "Lock X axis",
        toggleOnStr: "Lock X movement",
        toggleOffStr: "Enable X movement",
        keyboardShortcut: new KeyboardShortcut({ key: "y" }),
        enumString: "lockX",
    }),
    lockY: new RegisteredAction({
        desc: "Lock Y axis",
        toggleOnStr: "Lock Y movement",
        toggleOffStr: "Enable Y movement",
        keyboardShortcut: new KeyboardShortcut({ key: "x" }),
        enumString: "lockY",
    }),
    alignVertically: new RegisteredAction({
        desc: "Align vertically",
        keyboardShortcut: new KeyboardShortcut({ key: "v", alt: true }),
        enumString: "alignVertically",
    }),
    alignHorizontally: new RegisteredAction({
        desc: "Align horizontally",
        keyboardShortcut: new KeyboardShortcut({ key: "h", alt: true }),
        enumString: "alignHorizontally",
    }),
    evenlyDistributeVertically: new RegisteredAction({
        desc: "Evenly distribute marchers vertically",
        keyboardShortcut: new KeyboardShortcut({ key: "v", shift: true }),
        enumString: "evenlyDistributeVertically",
    }),
    evenlyDistributeHorizontally: new RegisteredAction({
        desc: "Evenly distribute marchers horizontally",
        keyboardShortcut: new KeyboardShortcut({ key: "h", shift: true }),
        enumString: "evenlyDistributeHorizontally",
    }),
    swapMarchers: new RegisteredAction({
        desc: "Swap marchers",
        keyboardShortcut: new KeyboardShortcut({ key: "s", shift: true }),
        enumString: "swapMarchers",
    }),

    // UI settings
    togglePreviousPagePaths: new RegisteredAction({
        desc: "Toggle viewing previous page paths",
        toggleOnStr: "Show previous page dots/paths",
        toggleOffStr: "Hide previous page dots/paths",
        keyboardShortcut: new KeyboardShortcut({ key: "n" }),
        enumString: "togglePreviousPagePaths",
    }),
    toggleNextPagePaths: new RegisteredAction({
        desc: "Toggle viewing next page paths",
        toggleOnStr: "Show next page dots/paths",
        toggleOffStr: "Hide next page dots/paths",
        keyboardShortcut: new KeyboardShortcut({ key: "m" }),
        enumString: "toggleNextPagePaths",
    }),

    // Cursor Mode
    applyQuickShape: new RegisteredAction({
        desc: "Snaps marchers to shape without creating an editable object",
        enumString: "applyQuickShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Enter", shift: true }),
    }),
    createMarcherShape: new RegisteredAction({
        desc: "Creates a new shape with lines or curves that can be edited across pages",
        enumString: "createMarcherShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Enter" }),
    }),
    deleteMarcherShape: new RegisteredAction({
        desc: "Deletes the current selected shapes",
        enumString: "deleteMarcherShape",
        keyboardShortcut: new KeyboardShortcut({ key: "Delete" }),
    }),
    cancelAlignmentUpdates: new RegisteredAction({
        desc: "Cancel updates to marchers",
        enumString: "cancelAlignmentUpdates",
        keyboardShortcut: new KeyboardShortcut({ key: "Escape" }),
    }),
    alignmentEventDefault: new RegisteredAction({
        desc: "Set cursor mode to default",
        enumString: "alignmentEventDefault",
        keyboardShortcut: new KeyboardShortcut({ key: "v" }),
    }),
    alignmentEventLine: new RegisteredAction({
        desc: "Create a line out of the selected marchers",
        enumString: "alignmentEventLine",
        keyboardShortcut: new KeyboardShortcut({ key: "l" }),
    }),

    // Select
    selectAllMarchers: new RegisteredAction({
        desc: "Select all marchers",
        keyboardShortcut: new KeyboardShortcut({ key: "a", control: true }),
        enumString: "selectAllMarchers",
    }),
} as const;

/**
 * The RegisteredActionsHandler is a component that listens for keyboard shortcuts and button clicks to trigger actions.
 * It is responsible for handling the actions and triggering the appropriate functions.
 *
 * All actions in OpenMarch that can be a keyboard shortcut or a button click should be registered here.
 */
function RegisteredActionsHandler() {
    const { registeredButtonActions } = useRegisteredActionsStore()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { setSelectedAudioFile } = useSelectedAudioFile()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;
    const {
        resetAlignmentEvent,
        setAlignmentEvent,
        setAlignmentEventMarchers,
        alignmentEventNewMarcherPages,
        alignmentEventMarchers,
    } = useAlignmentEventStore()!;

    const keyboardShortcutDictionary = useRef<{
        [shortcutKeyString: string]: RegisteredActionsEnum;
    }>({});

    /**
     * Get the MarcherPages for the selected marchers on the selected page.
     */
    const getSelectedMarcherPages = useCallback(() => {
        if (!selectedPage) {
            console.error("No selected page");
            return [];
        }
        // Get the marcherPages for the selected Page to make searching faster
        const selectedPageMarcherPages: MarcherPage[] = marcherPages.filter(
            (marcherPage) => marcherPage.page_id === selectedPage.id,
        );

        const selectedMarcherPages: MarcherPage[] = [];
        selectedMarchers.forEach((marcher) => {
            selectedMarcherPages.push(
                selectedPageMarcherPages.find(
                    (marcherPage) => marcherPage.marcher_id === marcher.id,
                )!,
            );
        });
        return selectedMarcherPages;
    }, [marcherPages, selectedMarchers, selectedPage]);

    /**
     * Trigger a RegisteredAction.
     */
    const triggerAction = useCallback(
        (action: RegisteredActionsEnum) => {
            let isElectronAction = true;

            // Check if this is an electron action
            switch (action) {
                case RegisteredActionsEnum.launchLoadFileDialogue:
                    window.electron.databaseLoad();
                    break;
                case RegisteredActionsEnum.launchSaveFileDialogue:
                    window.electron.databaseSave();
                    break;
                case RegisteredActionsEnum.launchNewFileDialogue:
                    window.electron.databaseCreate();
                    break;
                case RegisteredActionsEnum.launchInsertAudioFileDialogue:
                    window.electron.launchInsertAudioFileDialogue().then(() => {
                        AudioFile.getSelectedAudioFile().then((response) => {
                            const selectedAudioFileWithoutAudio = {
                                ...response,
                                data: undefined,
                            };
                            setSelectedAudioFile(selectedAudioFileWithoutAudio);
                        });
                    });
                    break;
                case RegisteredActionsEnum.launchImportMusicXmlFileDialogue:
                    window.electron
                        .launchImportMusicXmlFileDialogue()
                        .then((xmlString) => {
                            if (xmlString) {
                                // Convert the xmlString to an abcString
                                Measure.updateWithXml(xmlString);
                            }
                        });
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
            const registeredActionObject = RegisteredActionsObjects[action];
            switch (action) {
                /****************** Navigation and playback ******************/
                case RegisteredActionsEnum.launchLoadFileDialogue:
                case RegisteredActionsEnum.launchSaveFileDialogue:
                case RegisteredActionsEnum.launchNewFileDialogue:
                case RegisteredActionsEnum.launchInsertAudioFileDialogue:
                    break;
                case RegisteredActionsEnum.launchImportMusicXmlFileDialogue:
                    window.electron
                        .launchImportMusicXmlFileDialogue()
                        .then((xmlString) => {
                            if (xmlString) {
                                // Convert the xmlString to an abcString
                                Measure.updateWithXml(xmlString);
                            }
                        });
                    break;
                case RegisteredActionsEnum.performUndo:
                    window.electron.undo();
                    break;
                case RegisteredActionsEnum.performRedo:
                    window.electron.redo();
                    break;
                /****************** Navigation and playback ******************/
                case RegisteredActionsEnum.nextPage: {
                    const nextPage = selectedPage.getNextPage(pages);
                    if (nextPage && !isPlaying) setSelectedPage(nextPage);
                    break;
                }
                case RegisteredActionsEnum.lastPage: {
                    const lastPage = Page.getLastPage(pages);
                    if (lastPage && !isPlaying) setSelectedPage(lastPage);
                    break;
                }
                case RegisteredActionsEnum.previousPage: {
                    const previousPage = selectedPage.getPreviousPage(pages);
                    if (previousPage && !isPlaying)
                        setSelectedPage(previousPage);
                    break;
                }
                case RegisteredActionsEnum.firstPage: {
                    const firstPage = Page.getFirstPage(pages);
                    if (firstPage && !isPlaying) setSelectedPage(firstPage);
                    break;
                }
                case RegisteredActionsEnum.playPause: {
                    const nextPage = selectedPage.getNextPage(pages);
                    if (nextPage) setIsPlaying(!isPlaying);
                    break;
                }

                /****************** Batch Editing ******************/
                case RegisteredActionsEnum.setAllMarchersToPreviousPage: {
                    const previousPage = selectedPage.getPreviousPage(pages);
                    if (!previousPage) {
                        toast.error(
                            "Cannot set marcher coordinates to previous page. There is no previous page",
                        );
                        return;
                    }
                    const previousPageMarcherPages = marcherPages.filter(
                        (marcherPage) =>
                            marcherPage.page_id === previousPage?.id,
                    );
                    const changes = previousPageMarcherPages.map(
                        (marcherPage) => ({
                            ...marcherPage,
                            page_id: selectedPage.id,
                        }),
                    );
                    MarcherPage.updateMarcherPages(changes);
                    toast.success(
                        `Successfully set all marcher coordinates on page ${selectedPage.name} to the coordinates of the previous page ${previousPage.name}`,
                    );
                    break;
                }
                case RegisteredActionsEnum.setSelectedMarchersToPreviousPage: {
                    const previousPage = selectedPage.getPreviousPage(pages);
                    if (!previousPage) {
                        toast.error(
                            "Cannot set marcher coordinates to previous page. There is no previous page",
                        );
                        return;
                    }
                    const selectedMarcherIds = selectedMarchers.map(
                        (marcher) => marcher.id,
                    );
                    const previousMarcherPages = marcherPages.filter(
                        (marcherPage) =>
                            marcherPage.page_id === previousPage?.id &&
                            selectedMarcherIds.includes(marcherPage.marcher_id),
                    );
                    if (previousMarcherPages) {
                        const changes = previousMarcherPages.map(
                            (marcherPage) => ({
                                ...marcherPage,
                                page_id: selectedPage.id,
                            }),
                        );
                        MarcherPage.updateMarcherPages(changes);
                        toast.success(
                            `Successfully set ${previousMarcherPages.length} marcher coordinate${previousMarcherPages.length === 1 ? "" : "s"} on page ${selectedPage.name} to the coordinates of the previous page ${previousPage.name}`,
                        );
                    }
                    break;
                }
                case RegisteredActionsEnum.setAllMarchersToNextPage: {
                    const nextPage = selectedPage.getNextPage(pages);
                    if (!nextPage) {
                        toast.error(
                            "Cannot set marcher coordinates to next page. There is no next page",
                        );
                        return;
                    }
                    const nextPageMarcherPages = marcherPages.filter(
                        (marcherPage) => marcherPage.page_id === nextPage?.id,
                    );
                    const changes = nextPageMarcherPages.map((marcherPage) => ({
                        ...marcherPage,
                        page_id: selectedPage.id,
                    }));
                    MarcherPage.updateMarcherPages(changes);
                    toast.success(
                        `Successfully set all marcher coordinates on page ${selectedPage.name} to the coordinates of the next page ${nextPage.name}`,
                    );
                    break;
                }
                case RegisteredActionsEnum.setSelectedMarchersToNextPage: {
                    const nextPage = selectedPage.getNextPage(pages);
                    if (!nextPage) {
                        toast.error(
                            "Cannot set marcher coordinates to next page. There is no next page",
                        );
                        return;
                    }
                    const selectedMarcherIds = selectedMarchers.map(
                        (marcher) => marcher.id,
                    );
                    const nextMarcherPages = marcherPages.filter(
                        (marcherPage) =>
                            marcherPage.page_id === nextPage?.id &&
                            selectedMarcherIds.includes(marcherPage.marcher_id),
                    );
                    if (nextMarcherPages) {
                        const changes = nextMarcherPages.map((marcherPage) => ({
                            ...marcherPage,
                            page_id: selectedPage.id,
                        }));
                        MarcherPage.updateMarcherPages(changes);
                        toast.success(
                            `Successfully set ${nextMarcherPages.length} marcher coordinate${nextMarcherPages.length === 1 ? "" : "s"} on page ${selectedPage.name} to the coordinates of the next page ${nextPage.name}`,
                        );
                    }
                    break;
                }

                /****************** Alignment ******************/
                case RegisteredActionsEnum.snapToNearestWhole: {
                    const roundedCoords = CoordinateActions.getRoundCoordinates(
                        {
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties: fieldProperties,
                            denominator: 1,
                            xAxis: !uiSettings.lockX,
                            yAxis: !uiSettings.lockY,
                        },
                    );
                    MarcherPage.updateMarcherPages(roundedCoords);
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
                    MarcherPage.updateMarcherPages(alignedCoords);
                    break;
                }
                case RegisteredActionsEnum.alignHorizontally: {
                    const alignedCoords = CoordinateActions.alignHorizontally({
                        marcherPages: getSelectedMarcherPages(),
                    });
                    MarcherPage.updateMarcherPages(alignedCoords);
                    break;
                }
                case RegisteredActionsEnum.evenlyDistributeVertically: {
                    const distributedCoords =
                        CoordinateActions.evenlyDistributeVertically({
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties,
                        });
                    MarcherPage.updateMarcherPages(distributedCoords);
                    break;
                }
                case RegisteredActionsEnum.evenlyDistributeHorizontally: {
                    const distributedCoords =
                        CoordinateActions.evenlyDistributeHorizontally({
                            marcherPages: getSelectedMarcherPages(),
                            fieldProperties,
                        });
                    MarcherPage.updateMarcherPages(distributedCoords);
                    break;
                }
                case RegisteredActionsEnum.swapMarchers: {
                    if (selectedMarchers.length !== 2) {
                        console.error(
                            "Can only swap 2 marchers. Selected marchers:",
                            selectedMarchers,
                        );
                        toast.error(
                            "Can only swap when 2 marchers are selected.",
                        );
                        return;
                    }

                    const marchersStr = `marchers ${selectedMarchers[0].drill_number} and ${selectedMarchers[1].drill_number}`;
                    window.electron
                        .swapMarchers({
                            pageId: selectedPage.id,
                            marcher1Id: selectedMarchers[0].id,
                            marcher2Id: selectedMarchers[1].id,
                        })
                        .then((response) => {
                            if (response.success) {
                                toast.success(`Swapped ${marchersStr}`);
                                MarcherPage.fetchMarcherPages();
                                // This causes an infinite loop
                                // It's not a huge deal to leave it like this as marchers are updated on a refresh
                                MarcherShape.fetchShapePages();
                            } else {
                                const errorMessage =
                                    "Could not swap marchers " + marchersStr;
                                console.error(errorMessage, response.error);
                                toast.error(errorMessage);
                            }
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

                /****************** Cursor Mode ******************/
                case RegisteredActionsEnum.cancelAlignmentUpdates: {
                    if (alignmentEventMarchers.length > 0) {
                        setSelectedMarchers(alignmentEventMarchers);
                        resetAlignmentEvent();
                    } else {
                        // Deselect all shapes and marchers
                        setSelectedMarchers([]);
                        setSelectedMarcherShapes([]);
                    }
                    break;
                }
                case RegisteredActionsEnum.applyQuickShape: {
                    MarcherPage.updateMarcherPages(
                        alignmentEventNewMarcherPages,
                    );
                    resetAlignmentEvent();
                    break;
                }
                case RegisteredActionsEnum.createMarcherShape: {
                    const firstMarcherPage = alignmentEventNewMarcherPages[0];
                    const lastMarcherPage =
                        alignmentEventNewMarcherPages[
                            alignmentEventNewMarcherPages.length - 1
                        ];
                    const marcherIds = alignmentEventNewMarcherPages.map(
                        (marcherPage) => marcherPage.marcher_id,
                    );
                    MarcherShape.createMarcherShape({
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
                case RegisteredActionsEnum.selectAllMarchers:
                    setSelectedMarchers(marchers);
                    break;

                default:
                    console.error(
                        `No action registered for "${registeredActionObject.instructionalString}"`,
                    );
                    return;
            }
        },
        [
            alignmentEventMarchers,
            alignmentEventNewMarcherPages,
            fieldProperties,
            getSelectedMarcherPages,
            isPlaying,
            marcherPages,
            marchers,
            pages,
            resetAlignmentEvent,
            selectedMarchers,
            selectedPage,
            setAlignmentEvent,
            setAlignmentEventMarchers,
            setIsPlaying,
            setSelectedAudioFile,
            setSelectedMarcherShapes,
            setSelectedMarchers,
            setSelectedPage,
            setUiSettings,
            uiSettings,
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
        (e: KeyboardEvent) => {
            if (
                !document.activeElement?.matches(
                    "input, textarea, select, [contenteditable]",
                )
            ) {
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
                    " ", // Space
                    "Enter",
                    "Escape",
                ]);
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
            }
        },
        [triggerAction],
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
    }, [registeredButtonActions, triggerAction]);

    return <></>; // empty fragment
}

export default RegisteredActionsHandler;
