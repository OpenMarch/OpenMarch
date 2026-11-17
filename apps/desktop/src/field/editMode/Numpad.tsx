import { useTranslate } from "@tolgee/react";
import { BackspaceIcon } from "@phosphor-icons/react";
import { getButtonClassName } from "@openmarch/ui";

export type NumpadKey =
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "."
    | "+"
    | "-"
    | "/"
    | "yd"
    | "back"
    | "clear";

/**
 * The touch layout's number pad for a line's exact position (#824): digits, a point, the signs
 * that make a position relative (+4, -4), / for halves (85.33/2) and yd for yard lines. Fingers
 * get big keys and no system keyboard over the field.
 */
export function Numpad({
    onKey,
    yards,
}: {
    onKey: (key: NumpadKey) => void;
    /** Offer yd (X lines on a football field) */
    yards: boolean;
}) {
    const { t } = useTranslate();
    const keys: NumpadKey[] = [
        "7",
        "8",
        "9",
        "+",
        "4",
        "5",
        "6",
        "-",
        "1",
        "2",
        "3",
        "/",
        ".",
        "0",
        yards ? "yd" : "clear",
        "back",
    ];
    return (
        <div
            className="grid grid-cols-4 gap-4"
            role="group"
            aria-label={t("fieldEditMode.numberPad.label")}
            data-testid="field-line-number-pad"
        >
            {keys.map((key) => (
                <button
                    key={key}
                    type="button"
                    className={`${getButtonClassName({ variant: "secondary", size: "compact" })} text-body h-44 w-full tabular-nums`}
                    aria-label={
                        key === "back"
                            ? t("fieldEditMode.numberPad.back")
                            : key === "clear"
                              ? t("fieldEditMode.numberPad.clear")
                              : undefined
                    }
                    onClick={() => onKey(key)}
                >
                    {key === "back" ? (
                        <BackspaceIcon size={18} />
                    ) : key === "clear" ? (
                        t("fieldEditMode.numberPad.clearShort")
                    ) : (
                        key
                    )}
                </button>
            ))}
        </div>
    );
}
