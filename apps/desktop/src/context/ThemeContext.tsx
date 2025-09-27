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

    useEffect(() => {
        void window.electron.getTheme().then((storedTheme: string | null) => {
            if (storedTheme) {
                applyTheme(storedTheme);
            } else {
                const preferredTheme = getSystemTheme();
                applyTheme(preferredTheme);
            }
        });
    }, []);

    const getSystemTheme = () => {
        return window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    };

    const applyTheme = (theme: string) => {
        setTheme(theme);
        void window.electron.setTheme(theme);
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: applyTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
