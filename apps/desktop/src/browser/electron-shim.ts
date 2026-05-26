const disabledResponse = {
    success: false,
    error: { message: "Disabled in browser mode" },
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    return response.json() as Promise<T>;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
    return requestJson<T>(url, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

function deserializeAudioFile(audioFile: any) {
    if (audioFile?.data && Array.isArray(audioFile.data)) {
        return { ...audioFile, data: new Uint8Array(audioFile.data).buffer };
    }
    return audioFile;
}

if (typeof window !== "undefined" && !window.electron) {
    const browserSettings = {
        get: (key: string, defaultValue?: unknown) => {
            const rawValue = localStorage.getItem(`openmarch:${key}`);
            if (rawValue == null) return defaultValue;
            try {
                return JSON.parse(rawValue);
            } catch {
                return rawValue;
            }
        },
        set: (key: string, value: unknown) => {
            localStorage.setItem(`openmarch:${key}`, JSON.stringify(value));
        },
    };

    window.electron = {
        minimizeWindow: () => undefined,
        maximizeWindow: () => undefined,
        closeWindow: () => undefined,
        openMenu: () => undefined,
        isMacOS: navigator.platform.toLowerCase().includes("mac"),
        getEnv: async () => ({
            isCodegen: false,
            isCI: false,
            isPlaywrightSession: false,
        }),
        isCodegen: false,
        isPlaywrightSession: false,
        codegen: {
            clearMouseActions: async () => undefined,
            addMouseAction: () => undefined,
        },
        getTheme: async () => browserSettings.get("theme", "dark") as string,
        setTheme: async (theme: string) => browserSettings.set("theme", theme),
        getLanguage: async () =>
            browserSettings.get("language", "en") as string,
        setLanguage: async (language: string) =>
            browserSettings.set("language", language),
        send: (channel: string, ...args: any[]) => {
            if (channel === "settings:set") {
                const settings = args[0] || {};
                for (const [key, value] of Object.entries(settings)) {
                    browserSettings.set(key, value);
                }
            }
        },
        invoke: async (channel: string, ...args: any[]) => {
            if (channel === "settings:get") {
                return browserSettings.get(args[0]);
            }
            return undefined;
        },
        databaseIsReady: () => requestJson<boolean>("/api/database/is-ready"),
        databaseGetPath: () => requestJson<string>("/api/database/path"),
        databaseSave: async () => disabledResponse,
        databaseLoad: async () => disabledResponse,
        databaseCreate: async () => disabledResponse,
        repairDatabase: async () => disabledResponse,
        closeCurrentFile: async () => disabledResponse,
        onLoadFileResponse: () => () => undefined,
        onGetSvgForClose: () => undefined,
        getRecentFiles: async () => [],
        removeRecentFile: async () => undefined,
        clearRecentFiles: async () => undefined,
        clearMissingRecentFiles: async () => undefined,
        openRecentFile: async () => disabledResponse,
        removeFetchListener: () => undefined,
        showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
        export: {
            pdf: async () => disabledResponse,
            createExportDirectory: async () => "",
            generateDocForMarcher: async () => disabledResponse,
        },
        getCurrentFilename: async () => {
            const dbPath = await requestJson<string>("/api/database/path");
            return dbPath.split(/[\\/]/).pop() || "OpenMarch";
        },
        openExportDirectory: async () => disabledResponse,
        buffer: {
            from: (data: any) => new Uint8Array(data),
        },
        onHistoryAction: () => undefined,
        removeHistoryActionListener: () => undefined,
        undo: async () => disabledResponse,
        redo: async () => disabledResponse,
        flattenUndoGroupsAbove: async () => undefined,
        getUndoStackLength: async () => 0,
        getRedoStackLength: async () => 0,
        launchInsertAudioFileDialogue: async () => disabledResponse,
        getAudioFilesDetails: () => requestJson<any[]>("/api/audio/all"),
        getSelectedAudioFile: async () =>
            deserializeAudioFile(await requestJson<any>("/api/audio/selected")),
        setSelectedAudioFile: async (audioFileId: number) =>
            deserializeAudioFile(
                await postJson<any>("/api/audio/select", { audioFileId }),
            ),
        updateAudioFiles: (args: any[]) =>
            postJson("/api/audio/update", { args }),
        deleteAudioFile: async (audioFileId: number) =>
            deserializeAudioFile(
                await postJson<any>("/api/audio/delete", { audioFileId }),
            ),
        sqlProxy: (sql: string, params: any[], method: string) =>
            postJson("/api/sql/proxy", { sql, params, method }),
        unsafeSqlProxy: (sql: string) => postJson("/api/sql/unsafe", { sql }),
        log: async (
            level: "log" | "info" | "warn" | "error",
            message: string,
            ...args: any[]
        ) => {
            console[level](message, ...args);
        },
        openExternal: async (url: string) => window.open(url, "_blank"),
    } as any;

    window.plugins = {
        list: async () => [],
        get: async () => "",
        plugins: () => [],
        install: async () => false,
        uninstall: async () => false,
    } as any;
}
