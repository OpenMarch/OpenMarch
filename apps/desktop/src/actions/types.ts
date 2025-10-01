export enum ActionId {
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
  snapToNearestWhole = "snapToNearestWhole",
  lockX = "lockX",
  lockY = "lockY",
  alignVertically = "alignVertically",
  alignHorizontally = "alignHorizontally",
  evenlyDistributeHorizontally = "evenlyDistributeHorizontally",
  evenlyDistributeVertically = "evenlyDistributeVertically",
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
}

export type KeyboardShortcut = {
  key: string; // e.g., "z", "Enter", "ArrowLeft"
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ActionMeta = {
  id: ActionId;
  descKey: string;
  toggleOnKey?: string;
  toggleOffKey?: string;
  shortcuts?: KeyboardShortcut[]; // allow multiple bindings
  category: "file" | "edit" | "nav" | "align" | "ui" | "cursor" | "selection" | "custom";
  holdable?: boolean; // for repeat middleware (e.g., arrows/WASD)
};

export type ActionContext = {
  // Database and queries
  db: any;
  queryClient: any;
  
  // Canvas
  fabric: any;
  
  // Selection
  selection: {
    constraints: { lockX?: boolean; lockY?: boolean };
    setConstraints: (c: Partial<{ lockX?: boolean; lockY?: boolean }>) => void;
    selectedMarchers: any[];
    setSelectedMarchers: (marchers: any[]) => void;
    getSelectedMarcherPages: () => any[];
  };
  
  // Page navigation
  page: {
    selected: any;
    setSelected: (page: any) => void;
    all: any[];
    getNext: (current: any) => any | null;
    getPrevious: (current: any) => any | null;
  };
  
  // Playback
  playback: {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    toggleMetronome: () => void;
  };
  
  // UI settings
  ui: {
    settings: any;
    setSettings: (settings: any) => void;
    focusCanvas?: () => void;
    focusTimeline?: () => void;
  };
  
  // Queries (for data fetching)
  queries: {
    marcherPages: any;
    previousMarcherPages: any;
    nextMarcherPages: any;
    fieldProperties: any;
    canUndo: boolean;
    canRedo: boolean;
  };
  
  // Mutations (for data modification)
  mutations: {
    updateMarcherPages: (changes: any[]) => void;
    swapMarchers: (data: any) => void;
    createMarcherShape: (data: any) => void;
    performHistoryAction: (type: "undo" | "redo") => void;
  };
  
  // Alignment events
  alignment: {
    reset: () => void;
    setEvent: (event: any) => void;
    setMarchers: (marchers: any[]) => void;
    newMarcherPages: any[];
    marchers: any[];
  };
  
  // Electron API
  electron?: any;
  
  // Translation
  t: (key: string, params?: any) => string;
  toast: any;
};

export type ActionResult = { ok: true } | { ok: false; error: unknown };

export interface ActionCommand<P = unknown> {
  canExecute?(ctx: ActionContext, payload: P): boolean | Promise<boolean>;
  execute(ctx: ActionContext, payload: P): Promise<ActionResult> | ActionResult;
  getInverse?(ctx: ActionContext, payload: P): Promise<ActionCommand<P>> | ActionCommand<P>;
  isToggled?(ctx: ActionContext): boolean; // optional for toggle UI
}

export type ActionCommandFactory<P = unknown> = (payload: P) => ActionCommand<P>;
