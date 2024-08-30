import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { useCallback, useEffect, useRef } from "react";
import * as CoordinateActions from "./CoordinateActions";
import { MarcherPage } from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import Measure from "@/global/classes/Measure";
// import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";
// import xml2abcInterpreter from "electron/xml2abc-js/xml2abcInterpreter";

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

    // Alignment
    snapToNearestWhole = "snapToNearestWhole",
    lockX = "lockX",
    lockY = "lockY",
    alignVertically = "alignVertically",
    alignHorizontally = "alignHorizontally",
    evenlyDistributeHorizontally = "evenlyDistributeHorizontally",
    evenlyDistributeVertically = "evenlyDistributeVertically",

    // UI settings
    toggleNextPagePaths = "toggleNextPagePaths",
    togglePreviousPagePaths = "togglePreviousPagePaths",

    // Cursor Mode
    cursorModeDefault = "cursorModeDefault",
    cursorModeLine = "cursorModeLine",

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
                enumString as RegisteredActionsEnum
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
        keyboardShortcut: new KeyboardShortcut({ key: "z" }),
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
    cursorModeDefault: new RegisteredAction({
        desc: "Set cursor mode to default",
        enumString: "cursorModeDefault",
        keyboardShortcut: new KeyboardShortcut({ key: "v" }),
    }),
    cursorModeLine: new RegisteredAction({
        desc: "Set cursor mode to line",
        enumString: "cursorModeLine",
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
    // const { setCursorMode } = useCursorModeStore()!;

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
            (marcherPage) => marcherPage.page_id === selectedPage.id
        );

        const selectedMarcherPages: MarcherPage[] = [];
        selectedMarchers.forEach((marcher) => {
            selectedMarcherPages.push(
                selectedPageMarcherPages.find(
                    (marcherPage) => marcherPage.marcher_id === marcher.id
                )!
            );
        });
        return selectedMarcherPages;
    }, [marcherPages, selectedMarchers, selectedPage]);

    /**
     * Trigger a RegisteredAction.
     */
    const triggerAction = useCallback(
        (action: RegisteredActionsEnum) => {
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
                    const previousPageMarcherPages = marcherPages.filter(
                        (marcherPage) =>
                            marcherPage.page_id === previousPage?.id
                    );
                    const changes = previousPageMarcherPages.map(
                        (marcherPage) => ({
                            ...marcherPage,
                            page_id: selectedPage.id,
                        })
                    );
                    MarcherPage.updateMarcherPages(changes);
                    break;
                }
                case RegisteredActionsEnum.setSelectedMarchersToPreviousPage: {
                    const previousPage = selectedPage.getPreviousPage(pages);
                    const selectedMarcherIds = selectedMarchers.map(
                        (marcher) => marcher.id
                    );
                    const previousMarcherPages = marcherPages.filter(
                        (marcherPage) =>
                            marcherPage.page_id === previousPage?.id &&
                            selectedMarcherIds.includes(marcherPage.marcher_id)
                    );
                    if (previousMarcherPages) {
                        const changes = previousMarcherPages.map(
                            (marcherPage) => ({
                                ...marcherPage,
                                page_id: selectedPage.id,
                            })
                        );
                        MarcherPage.updateMarcherPages(changes);
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
                        }
                    );
                    MarcherPage.updateMarcherPages(roundedCoords);
                    break;
                }
                case RegisteredActionsEnum.lockX:
                    setUiSettings(
                        { ...uiSettings, lockX: !uiSettings.lockX },
                        "lockX"
                    );
                    break;
                case RegisteredActionsEnum.lockY:
                    setUiSettings(
                        { ...uiSettings, lockY: !uiSettings.lockY },
                        "lockY"
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
                        });
                    MarcherPage.updateMarcherPages(distributedCoords);
                    break;
                }
                case RegisteredActionsEnum.evenlyDistributeHorizontally: {
                    const distributedCoords =
                        CoordinateActions.evenlyDistributeHorizontally({
                            marcherPages: getSelectedMarcherPages(),
                        });
                    MarcherPage.updateMarcherPages(distributedCoords);
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

                /****************** UI settings ******************/
                // case RegisteredActionsEnum.cursorModeDefault:
                //     setCursorMode("default");
                //     break;
                // case RegisteredActionsEnum.cursorModeLine:
                //     setCursorMode("line");
                //     break;

                /****************** Select ******************/
                case RegisteredActionsEnum.selectAllMarchers:
                    setSelectedMarchers(marchers);
                    break;

                default:
                    console.error(
                        `No action registered for "${registeredActionObject.instructionalString}"`
                    );
                    return;
            }
        },
        [
            fieldProperties,
            getSelectedMarcherPages,
            isPlaying,
            marcherPages,
            marchers,
            pages,
            selectedMarchers,
            selectedPage,
            setIsPlaying,
            setSelectedAudioFile,
            setSelectedMarchers,
            setSelectedPage,
            setUiSettings,
            uiSettings,
        ]
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
                    `Duplicate keyboard shortcut for \`${keyboardShortcut}\` \nAction: \`${action}\` and \`${tempDict[keyboardShortcut]}\``
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
                    "input, textarea, select, [contenteditable]"
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
                ]);
                if (code.includes("Key")) {
                    key = code.replace("Key", "");
                } else if (code.includes("Digit")) {
                    key = code.replace("Digit", "");
                } else if (!ignoredKeys.has(key)) {
                    console.error(
                        `RegisteredAction Warning: No keyCode handler found for "${code}".`,
                        "This key may not work as expected if using as a registered action shortcut."
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
                        keyboardShortcutDictionary.current[keyString]
                    );
                    e.preventDefault();
                }
            }
        },
        [triggerAction]
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
                console.error(
                    `No button ref for ${buttonAction.registeredAction}`
                );
                return;
            }
            buttonAction.buttonRef.current.onclick = () =>
                triggerAction(buttonAction.registeredAction);
        });
    }, [registeredButtonActions, triggerAction]);

    return <></>; // empty fragment
}

export default RegisteredActionsHandler;
