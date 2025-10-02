import { ActionId, ActionMeta, ActionCommand, ActionContext } from "../../types";
import { ActionRegistry } from "../../registry";

class LaunchLoadDialogueCommand implements ActionCommand<void> {
  async execute(ctx: ActionContext) {
    if (!ctx.electron) {
      return { ok: false, error: new Error("Electron not available") };
    }
    try {
      await ctx.electron.databaseLoad();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

class LaunchSaveDialogueCommand implements ActionCommand<void> {
  async execute(ctx: ActionContext) {
    if (!ctx.electron) {
      return { ok: false, error: new Error("Electron not available") };
    }
    try {
      await ctx.electron.databaseSave();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

class LaunchNewDialogueCommand implements ActionCommand<void> {
  async execute(ctx: ActionContext) {
    if (!ctx.electron) {
      return { ok: false, error: new Error("Electron not available") };
    }
    try {
      await ctx.electron.databaseCreate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

class LaunchInsertAudioDialogueCommand implements ActionCommand<void> {
  async execute(ctx: ActionContext) {
    if (!ctx.electron) {
      return { ok: false, error: new Error("Electron not available") };
    }
    try {
      await ctx.electron.launchInsertAudioFileDialogue();
      // Refresh selected audio file
      const AudioFile = await import("@/api/api").then(m => m.AudioFile);
      const response = await AudioFile.getSelectedAudioFile();
      ctx.ui.setSettings?.({
        ...ctx.ui.settings,
        selectedAudioFile: { ...response, data: undefined },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
}

class LaunchImportMusicXmlDialogueCommand implements ActionCommand<void> {
  execute(ctx: ActionContext) {
    console.log("launchImportMusicXmlFileDialogue - not yet implemented");
    return { ok: true };
  }
}

export const registerElectronFileOps = (registry: ActionRegistry) => {
  registry.register(
    {
      id: ActionId.launchLoadFileDialogue,
      descKey: "actions.file.loadDialogue",
      category: "file",
    },
    () => new LaunchLoadDialogueCommand()
  );

  registry.register(
    {
      id: ActionId.launchSaveFileDialogue,
      descKey: "actions.file.saveDialogue",
      category: "file",
    },
    () => new LaunchSaveDialogueCommand()
  );

  registry.register(
    {
      id: ActionId.launchNewFileDialogue,
      descKey: "actions.file.newDialogue",
      category: "file",
    },
    () => new LaunchNewDialogueCommand()
  );

  registry.register(
    {
      id: ActionId.launchInsertAudioFileDialogue,
      descKey: "actions.file.insertAudio",
      category: "file",
    },
    () => new LaunchInsertAudioDialogueCommand()
  );

  registry.register(
    {
      id: ActionId.launchImportMusicXmlFileDialogue,
      descKey: "actions.file.importMusicXml",
      category: "file",
    },
    () => new LaunchImportMusicXmlDialogueCommand()
  );
};
