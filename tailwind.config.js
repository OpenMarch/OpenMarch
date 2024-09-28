import defaultTheme from "tailwindcss/defaultTheme";

/* eslint-disable import/no-anonymous-default-export */
/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        borderRadius: {
            6: "6px",
            full: "9999px",
        },
        backgroundImage: {
            "fg-1": "linear-gradient(to bottom, rgba(var(--fg-1-stop-1)), rgba(var(--fg-1-stop-2)))",
            "fg-2": "linear-gradient(to bottom, rgba(var(--fg-2-stop-1)), rgba(var(--fg-2-stop-2)))",
        },
        colors: {
            transparent: "transparent",
            white: "#fff",
            black: "#000",
            "bg-1": "rgba(var(--bg-1))",
            stroke: "rgba(var(--stroke))",
            text: "rgba(var(--text))",
            "text-invert": "rgba(var(--text-invert))",
            accent: "rgba(var(--accent))",
            red: "rgba(var(--red))",
            yellow: "rgba(var(--yellow))",
            green: "rgba(var(--green))",
        },
        fontFamily: {
            sans: ["'DM Sans'", ...defaultTheme.fontFamily.sans],
        },
        fontSize: {
            h1: "3rem",
            h2: "2.25rem",
            h3: "1.75rem",
            h4: "1.25rem",
            body: "0.875rem",
            sub: "0.6875rem",
        },
        spacing: {
            256: "256px",
            200: "200px",
            128: "128px",
            110: "110px",
            96: "96px",
            86: "86px",
            72: "72px",
            64: "64px",
            56: "56px",
            48: "48px",
            36: "36px",
            32: "32px",
            30: "30px",
            28: "28px",
            24: "24px",
            22: "22px",
            20: "20px",
            18: "18px",
            16: "16px",
            14: "14px",
            12: "12px",
            10: "10px",
            8: "8px",
            6: "6px",
            4: "4px",
            2: "2px",
            0: "0px",
        },
        extend: {
            keyframes: {
                "scale-in": {
                    from: { opacity: "0", transform: "scale(0.95)" },
                    to: { opacity: "1", transform: "scale(1)" },
                },
                "scale-out": {
                    from: { opacity: "1", transform: "scale(1)" },
                    to: { opacity: "0", transform: "scale(0.95)" },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
                "fade-out": {
                    from: { opacity: "1" },
                    to: { opacity: "0" },
                },
            },
            animation: {
                "scale-in": "scale-in 150ms ease-out",
                "scale-out": "scale-out 150ms ease-out",
                "fade-in": "fade-in 150ms ease-out",
                "fade-out": "fade-out 150ms ease-out",
            },
        },
    },
    darkMode: "class",
};
