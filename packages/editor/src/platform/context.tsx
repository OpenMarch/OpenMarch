import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import type { PlatformAdapter, PlatformCapabilities } from "./types";

interface PlatformContextValue {
    adapter: PlatformAdapter;
    isInitialized: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export interface PlatformProviderProps {
    /** The platform adapter implementation */
    adapter: PlatformAdapter;
    /** Child components */
    children: ReactNode;
    /** Loading component while adapter initializes */
    fallback?: ReactNode;
}

/**
 * Provides platform-specific functionality to the editor
 *
 * @example
 * ```tsx
 * import { PlatformProvider, Editor } from "@openmarch/editor";
 * import { createElectronAdapter } from "./platform/ElectronAdapter";
 *
 * const adapter = createElectronAdapter();
 *
 * function App() {
 *   return (
 *     <PlatformProvider adapter={adapter}>
 *       <Editor />
 *     </PlatformProvider>
 *   );
 * }
 * ```
 */
export function PlatformProvider({
    adapter,
    children,
    fallback,
}: PlatformProviderProps) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let mounted = true;

        adapter
            .initialize()
            .then(() => {
                if (mounted) {
                    setIsInitialized(true);
                }
            })
            .catch((err) => {
                if (mounted) {
                    setError(err);
                    console.error("Failed to initialize platform adapter:", err);
                }
            });

        return () => {
            mounted = false;
            adapter.destroy().catch((err) => {
                console.error("Failed to destroy platform adapter:", err);
            });
        };
    }, [adapter]);

    if (error) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <div className="text-center">
                    <h1 className="text-xl font-bold text-red-500">
                        Failed to initialize
                    </h1>
                    <p className="text-gray-500">{error.message}</p>
                </div>
            </div>
        );
    }

    if (!isInitialized) {
        return <>{fallback ?? null}</>;
    }

    return (
        <PlatformContext.Provider value={{ adapter, isInitialized }}>
            {children}
        </PlatformContext.Provider>
    );
}

/**
 * Get the platform adapter
 *
 * @throws Error if used outside of PlatformProvider
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const platform = usePlatform();
 *
 *   const handleSave = async () => {
 *     await platform.file.saveProject();
 *   };
 *
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function usePlatform(): PlatformAdapter {
    const context = useContext(PlatformContext);
    if (!context) {
        throw new Error("usePlatform must be used within a PlatformProvider");
    }
    return context.adapter;
}

/**
 * Get platform capabilities
 *
 * Useful for conditionally rendering UI based on platform features
 *
 * @example
 * ```tsx
 * function ExportMenu() {
 *   const capabilities = usePlatformCapabilities();
 *
 *   if (!capabilities.canExportPdf) {
 *     return null;
 *   }
 *
 *   return <button>Export PDF</button>;
 * }
 * ```
 */
export function usePlatformCapabilities(): PlatformCapabilities {
    return usePlatform().capabilities;
}

/**
 * Get the database adapter
 */
export function useDatabase() {
    return usePlatform().database;
}

/**
 * Get the file adapter
 */
export function useFile() {
    return usePlatform().file;
}

/**
 * Get the audio adapter
 */
export function useAudio() {
    return usePlatform().audio;
}

/**
 * Get the settings adapter
 */
export function useSettings() {
    return usePlatform().settings;
}

/**
 * Get the history adapter
 */
export function useHistory() {
    return usePlatform().history;
}

/**
 * Get the window adapter (desktop only)
 * Returns undefined on web
 */
export function useWindow() {
    return usePlatform().window;
}

/**
 * Get the export adapter (desktop only)
 * Returns undefined on web
 */
export function useExport() {
    return usePlatform().export;
}

/**
 * Check if the platform is initialized
 */
export function usePlatformInitialized(): boolean {
    const context = useContext(PlatformContext);
    return context?.isInitialized ?? false;
}
