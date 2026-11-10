import * as mainProcess from "./index";
import { openView3dWindow } from "./view3dWindow";
import { t } from "./i18n";
import { app, dialog, Menu, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import {
    HELP_MENU_ACTIONS,
    PLAYBACK_MENU_ACTIONS,
    type MenuAction,
} from "../../src/global/menuActions";
import { SITE_URL, siteUrl } from "../../src/global/siteUrl";

/**
 * A menu item that runs a renderer action (docs/adr/0003-menu-actions-ipc.md). The shortcut is
 * shown but never registered: the renderer's keyboard handler owns the key, so Space and single
 * letters still type in text fields. macOS always registers a menu accelerator, so there the
 * shortcut goes in the label instead.
 */
const rendererActionItem =
    (isMacOS: boolean) =>
    ({
        action,
        labelKey,
        accelerator,
    }: MenuAction): MenuItemConstructorOptions =>
        isMacOS
            ? {
                  label: t("menu.withShortcut", {
                      label: t(labelKey),
                      shortcut: accelerator.replace("Shift+/", "?"),
                  }),
                  click: () => mainProcess.sendMenuAction(action),
              }
            : {
                  label: t(labelKey),
                  accelerator,
                  registerAccelerator: false,
                  click: () => mainProcess.sendMenuAction(action),
              };

/** A link in the Help menu. */
const linkItem = (label: string, url: string): MenuItemConstructorOptions => ({
    label,
    click: async () => {
        await shell.openExternal(url);
    },
});

/**
 * The application menu in the app language (`./i18n`). Built again whenever the language
 * changes, since Electron can't relabel a menu in place, and when the editor mode changes: in
 * Basic the Playback menu leaves out the items whose actions Basic turns off. Role items get their
 * labels here too: Electron's own role labels are English only.
 */
export function buildApplicationMenu({ basic = false } = {}): Menu {
    return Menu.buildFromTemplate(
        applicationMenuTemplate({
            basic,
            isMacOS: process.platform === "darwin",
        }),
    );
}

/**
 * The menu's template for one system. Exported for the user guide's Menus page, which shows the
 * macOS and the Windows/Linux menus (`scripts/docs-reference/generate.mts`).
 */
// eslint-disable-next-line max-lines-per-function -- the menu template, one item per entry
export function applicationMenuTemplate({
    basic,
    isMacOS,
}: {
    basic: boolean;
    isMacOS: boolean;
}): MenuItemConstructorOptions[] {
    const appName = app.name;
    const template: MenuItemConstructorOptions[] = [];

    if (isMacOS) {
        template.push({
            label: appName,
            submenu: [
                { role: "about", label: t("menu.app.about", { appName }) },
                { type: "separator" },
                { role: "services", label: t("menu.app.services") },
                { type: "separator" },
                { role: "hide", label: t("menu.app.hide", { appName }) },
                { role: "hideOthers", label: t("menu.app.hideOthers") },
                { role: "unhide", label: t("menu.app.showAll") },
                { type: "separator" },
                { role: "quit", label: t("menu.app.quit", { appName }) },
            ],
        });
    }

    template.push(
        {
            label: t("menu.file.title"),
            submenu: [
                {
                    label: t("menu.file.open"),
                    accelerator: "CommandOrControl+O",
                    click() {
                        void mainProcess.loadDatabaseFile();
                    },
                },
                { type: "separator" },
                {
                    label: t("menu.file.createNew"),
                    accelerator: "CommandOrControl+N",
                    click() {
                        void mainProcess.requestNewShowFromMenu();
                    },
                },
                {
                    label: t("menu.file.saveAsCopy"),
                    click(_item, focusedWindow) {
                        if (!focusedWindow) {
                            return dialog.showErrorBox(
                                t("menu.file.noDocument.title"),
                                t("menu.file.noDocument.message"),
                            );
                        }
                        void mainProcess.saveFile();
                    },
                },
                {
                    label: t("menu.file.closeFile"),
                    click() {
                        void mainProcess.closeCurrentFile();
                    },
                },
            ],
        },
        {
            label: t("menu.edit.title"),
            submenu: [
                { type: "separator" },
                { role: "cut", label: t("menu.edit.cut") },
                { role: "copy", label: t("menu.edit.copy") },
                { role: "paste", label: t("menu.edit.paste") },
                ...(isMacOS
                    ? ([
                          {
                              role: "pasteAndMatchStyle",
                              label: t("menu.edit.pasteAndMatchStyle"),
                          },
                          { role: "delete", label: t("menu.edit.delete") },
                          {
                              role: "selectAll",
                              label: t("menu.edit.selectAll"),
                          },
                          { type: "separator" },
                          {
                              label: t("menu.edit.speech"),
                              submenu: [
                                  {
                                      role: "startSpeaking",
                                      label: t("menu.edit.startSpeaking"),
                                  },
                                  {
                                      role: "stopSpeaking",
                                      label: t("menu.edit.stopSpeaking"),
                                  },
                              ],
                          },
                      ] satisfies MenuItemConstructorOptions[])
                    : ([
                          { role: "delete", label: t("menu.edit.delete") },
                          { type: "separator" },
                          {
                              role: "selectAll",
                              label: t("menu.edit.selectAll"),
                          },
                      ] satisfies MenuItemConstructorOptions[])),
            ],
        },
        {
            label: t("menu.view.title"),
            submenu: [
                {
                    label: t("menu.view.open3dView"),
                    click() {
                        openView3dWindow();
                    },
                },
                { type: "separator" },
                { role: "reload", label: t("menu.view.reload") },
                { role: "forceReload", label: t("menu.view.forceReload") },
                {
                    role: "toggleDevTools",
                    label: t("menu.view.toggleDevTools"),
                },
                { type: "separator" },
                { role: "resetZoom", label: t("menu.view.resetZoom") },
                { role: "zoomIn", label: t("menu.view.zoomIn") },
                { role: "zoomOut", label: t("menu.view.zoomOut") },
                { type: "separator" },
                {
                    role: "togglefullscreen",
                    label: t("menu.view.toggleFullScreen"),
                },
            ],
        },
        {
            label: t("menu.playback.title"),
            submenu: PLAYBACK_MENU_ACTIONS.filter(
                (item) => !(basic && item.expertOnly),
            ).map(rendererActionItem(isMacOS)),
        },
        isMacOS
            ? {
                  label: t("menu.window.title"),
                  submenu: [
                      { role: "minimize", label: t("menu.window.minimize") },
                      { role: "zoom", label: t("menu.window.zoom") },
                      { type: "separator" },
                      { role: "front", label: t("menu.window.front") },
                      { type: "separator" },
                      { role: "window", label: t("menu.window.title") },
                  ],
              }
            : {
                  label: t("menu.window.title"),
                  submenu: [
                      { role: "minimize", label: t("menu.window.minimize") },
                      { role: "zoom", label: t("menu.window.zoom") },
                      { role: "close", label: t("menu.window.close") },
                  ],
              },
        {
            role: "help",
            label: t("menu.help.title"),
            submenu: [
                ...HELP_MENU_ACTIONS.map(rendererActionItem(isMacOS)),
                { type: "separator" },
                linkItem(t("menu.help.website"), SITE_URL),
                linkItem(t("menu.help.guides"), siteUrl("/guides")),
                // i18n-ignore: brand name, the same in every language
                linkItem("Discord", "https://discord.gg/eTsQ98uZzq"),
                // i18n-ignore: brand name, the same in every language
                linkItem("GitHub", "https://github.com/OpenMarch"),
            ],
        },
    );

    return template;
}
