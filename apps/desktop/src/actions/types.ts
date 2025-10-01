export enum ActionId {
  launchLoadFileDialogue = "launchLoadFileDialogue",
  performUndo = "performUndo",
  nextPage = "nextPage",
  lockX = "lockX",
  // move remaining actions here incrementally
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
  db: any;
  queryClient: any;
  fabric: any;
  selection: {
    constraints: { lockX?: boolean };
    setConstraints: (c: Partial<{ lockX: boolean }>) => void;
    // other selection services
  };
  history: {
    push: (cmd: ActionCommand<any>) => Promise<void> | void;
    undo: () => Promise<void>;
    canUndo: () => boolean | Promise<boolean>;
  };
  electron?: any;
  // add other app services here; keep stable and mockable
};

export type ActionResult = { ok: true } | { ok: false; error: unknown };

export interface ActionCommand<P = unknown> {
  canExecute?(ctx: ActionContext, payload: P): boolean | Promise<boolean>;
  execute(ctx: ActionContext, payload: P): Promise<ActionResult> | ActionResult;
  getInverse?(ctx: ActionContext, payload: P): Promise<ActionCommand<P>> | ActionCommand<P>;
  isToggled?(ctx: ActionContext): boolean; // optional for toggle UI
}

export type ActionCommandFactory<P = unknown> = (payload: P) => ActionCommand<P>;
