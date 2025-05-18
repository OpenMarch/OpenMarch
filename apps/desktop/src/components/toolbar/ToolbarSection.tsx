export default function ToolbarSection({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-[2.55rem] w-fit items-center gap-20 border px-16">
            {children}
        </div>
    );
}
