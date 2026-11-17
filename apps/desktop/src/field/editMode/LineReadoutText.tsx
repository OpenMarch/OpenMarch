import { useTranslate } from "@tolgee/react";
import type { LineReadout } from "./lines";

/**
 * A line position in words, as a drag's readout shows it: "S2 · 44 steps · 4 to S2 25 · 4 to S2
 * 20" (X) or "20 steps behind the front · 8 to FH" (Y).
 */
export function LineReadoutText({
    readout,
    adding,
    mirrored,
}: {
    readout: LineReadout;
    /** A new line out of the ruler, not a moved one */
    adding?: boolean;
    /** Its twin on the other side is added or moved too */
    mirrored?: boolean;
}) {
    const { t } = useTranslate();
    const where =
        readout.axis === "y"
            ? t("fieldEditMode.readout.behindFront", {
                  steps: readout.distance,
              })
            : readout.side === null
              ? t("fieldEditMode.readout.center")
              : t("fieldEditMode.readout.fromCenter", {
                    side: readout.sideName,
                    steps: readout.distance,
                });
    return (
        <span className="flex flex-col gap-2">
            <span>
                {adding && (
                    <span className="font-medium">
                        {t("fieldEditMode.readout.newLine")}{" "}
                    </span>
                )}
                {[
                    where,
                    ...readout.neighbors.map((n) =>
                        t("fieldEditMode.readout.toLine", {
                            steps: n.distance,
                            line: n.label,
                        }),
                    ),
                ].join(" · ")}
            </span>
            {mirrored && (
                <span className="text-text-subtitle">
                    {t("fieldEditMode.readout.mirrored")}
                </span>
            )}
        </span>
    );
}
