export default function EditorContainer({
    headerLeftText,
    headerRightText,
    topBorder = true,
    children,
}: {
    headerLeftText: string;
    headerRightText?: string;
    topBorder?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-3">
            <h3
                className={`flex pl-2 pr-4 py-2 mb-3 text-xl border-0 border-solid border-y-2 bg-gray-700 mt-0 ${
                    topBorder
                        ? " border-y-gray-500"
                        : " border-b-gray-500 border-t-0"
                }`}
            >
                <div>{headerLeftText}</div>
                {headerRightText && (
                    <>
                        <div className="flex-grow" />
                        <div>{headerRightText}</div>{" "}
                    </>
                )}
            </h3>
            <div className="ml-3">{children}</div>
        </div>
    );
}
