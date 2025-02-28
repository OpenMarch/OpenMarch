import clsx from "clsx";

export default function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={clsx("h-full w-full animate-pulse bg-fg-2", className)}
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
