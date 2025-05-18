import clsx from "clsx";

export default function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={clsx("bg-fg-2 h-full w-full animate-pulse", className)}
            style={{
                borderRadius: "0.5rem",
            }}
            {...props}
        >
            &nbsp;
        </div>
    );
}

Skeleton.displayName = "Skeleton";
