import { Fragment } from "react";

/** A shortcut as one unit: a cap per key, joined by "+", that never wraps apart. */
export default function Keycaps({ keys }: { keys: readonly string[] }) {
    return (
        <kbd className="keycaps">
            {keys.map((key, i) => (
                <Fragment key={`${key}-${i}`}>
                    {i > 0 && (
                        <span aria-hidden="true" className="keycaps-plus">
                            +
                        </span>
                    )}
                    <kbd className="keycap">{key}</kbd>
                </Fragment>
            ))}
        </kbd>
    );
}
