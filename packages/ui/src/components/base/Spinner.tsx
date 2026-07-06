import { CircleNotchIcon } from "@phosphor-icons/react";
import clsx from "clsx";

interface SpinnerProps {
    size?: number;
    className?: string;
}

export const Spinner = ({ size = 24, className }: SpinnerProps) => (
    <CircleNotchIcon
        size={size}
        className={clsx("text-text-subtitle animate-spin", className)}
    />
);
