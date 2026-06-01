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
