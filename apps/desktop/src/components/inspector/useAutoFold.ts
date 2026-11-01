import { useEffect, useRef, useState } from "react";

/**
 * Open/closed state for a section that folds itself while `folded` is true and
 * goes back to the person's own choice when it turns false. They can still
 * open or close it in between.
 */
export function useAutoFold(
    folded: boolean,
    initiallyOpen = true,
): [open: boolean, setOpen: (open: boolean) => void] {
    const [open, setOpen] = useState(() => initiallyOpen && !folded);
    const openBeforeFold = useRef(initiallyOpen);
    const wasFolded = useRef(folded);
    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => {
        if (folded === wasFolded.current) return;
        wasFolded.current = folded;
        if (folded) {
            openBeforeFold.current = openRef.current;
            setOpen(false);
        } else {
            setOpen(openBeforeFold.current);
        }
    }, [folded]);

    return [open, setOpen];
}
