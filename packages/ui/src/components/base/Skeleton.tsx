import clsx from "clsx";

export function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={clsx(
                "bg-text/5 rounded-6 h-full w-full animate-pulse",
                className,
            )}
            {...props}
        >
            &nbsp;
        </div>
    );
}
