import {
    createContext,
    useState,
    useEffect,
    useContext,
    ReactNode,
} from "react";

interface ThemeContextProps {
    theme: string;
    setTheme: (theme: string) => void;
}

/** Read by index.html before the first paint; keep the two in step */
const THEME_CACHE_KEY = "openmarch:theme";

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    // index.html set it before the first paint
    const [theme, setTheme] = useState<string>(() =>
        document.documentElement.classList.contains("dark") ? "dark" : "light",
    );

    const getSystemTheme = () => {
        return window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    };

    /** Updates this window only. */
    const showTheme = (next: string) => {
        setTheme(next);
        document.documentElement.classList.toggle("dark", next === "dark");
        // For index.html's first paint where nothing else knows the theme (the web build)
        try {
            localStorage.setItem(THEME_CACHE_KEY, next);
        } catch {
            // Storage blocked: the page just paints light first
        }
    };

    /** Updates this window and saves, which tells the other windows. */
    const applyTheme = (next: string) => {
        showTheme(next);
        void window.electron?.setTheme(next);
    };

    useEffect(() => {
        void window.electron?.getTheme().then((storedTheme: string | null) => {
            if (storedTheme) {
                showTheme(storedTheme);
            } else {
                const preferredTheme = getSystemTheme();
                applyTheme(preferredTheme);
            }
        });
    }, []);

    useEffect(() => {
        if (!window.electron?.onSettingsChanged) return;
        const unsubscribe = window.electron.onSettingsChanged((change) => {
            if (typeof change.theme === "string") showTheme(change.theme);
        });
        return () => {
            void unsubscribe();
        };
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme: applyTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
