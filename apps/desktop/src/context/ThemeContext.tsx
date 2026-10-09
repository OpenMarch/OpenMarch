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

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setTheme] = useState<string>("dark");

    const getSystemTheme = () => {
        return window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    };

    /** Updates this window only. */
    const showTheme = (next: string) => {
        setTheme(next);
        document.documentElement.classList.toggle("dark", next === "dark");
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
