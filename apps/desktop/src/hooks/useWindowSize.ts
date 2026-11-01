import { useEffect, useState } from "react";

/** The window's size, kept current. */
export function useWindowSize() {
    const read = () => ({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    const [size, setSize] = useState(read);
    useEffect(() => {
        const onResize = () => setSize(read());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return size;
}
