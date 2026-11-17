import type { ReactNode } from "react";

export function Field({
    label,
    children,
    help,
}: {
    label: string;
    children: ReactNode;
    help?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-6">
            <p className="text-sub text-text/60">{label}</p>
            {children}
            {help}
        </div>
    );
}

export const Help = ({
    children,
    testId,
    id,
}: {
    children: ReactNode;
    testId?: string;
    /** For a control's `aria-describedby`, when the help says why it's unavailable */
    id?: string;
}) => (
    <p className="text-sub text-text/60" data-testid={testId} id={id}>
        {children}
    </p>
);
