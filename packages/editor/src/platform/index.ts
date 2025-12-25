// Platform adapter types
export type {
    PlatformAdapter,
    PlatformCapabilities,
    DatabaseAdapter,
    SqlProxyResult,
    FileAdapter,
    RecentFile,
    AudioAdapter,
    AudioFileDetails,
    SettingsAdapter,
    HistoryAdapter,
    HistoryState,
    WindowAdapter,
    ExportAdapter,
    LogAdapter,
    EnvironmentInfo,
} from "./types";

// Platform context and hooks
export {
    PlatformProvider,
    usePlatform,
    usePlatformCapabilities,
    useDatabase,
    useFile,
    useAudio,
    useSettings,
    useHistory,
    useWindow,
    useExport,
    usePlatformInitialized,
    type PlatformProviderProps,
} from "./context";
