import { HourglassMediumIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { twMerge } from "tailwind-merge";
import {
    expiryNoticeDays,
    formatExpiryDate,
    type EnsembleExpiry,
} from "./utilities/ensembleExpiry";

/** Pill naming the day an expired ensemble's seats ran out. */
export function ExpiredBadge({ expiresOn }: { expiresOn: string | null }) {
    const { t } = useTranslate();
    return (
        <span
            className="text-sub bg-red/10 text-red rounded-full px-8 py-2 whitespace-nowrap"
            data-testid="ensemble-expired-badge"
        >
            {t("ensembles.expiry.expiredBadge", {
                date: formatExpiryDate(expiresOn),
            })}
        </span>
    );
}

/**
 * "Expires in N days" for an active ensemble in its final 30 days. Renders
 * nothing otherwise, and nothing at all for an expired ensemble.
 */
export function ExpiryNotice({
    ensemble,
    className,
}: {
    ensemble: EnsembleExpiry;
    className?: string;
}) {
    const { t } = useTranslate();
    const days = expiryNoticeDays(ensemble);
    if (days === undefined) return null;
    return (
        <p
            // twMerge reads text-sub as a color, so the size goes on after it
            className={`${twMerge(
                "text-text-subtitle flex items-start gap-4",
                className,
            )} text-sub`}
            data-testid="ensemble-expiry-notice"
        >
            <HourglassMediumIcon
                size={14}
                className="text-yellow mt-2 shrink-0"
                aria-hidden
            />
            <span>
                {t("ensembles.expiry.expiresIn", {
                    days,
                    date: formatExpiryDate(ensemble.expires_on),
                })}
            </span>
        </p>
    );
}
