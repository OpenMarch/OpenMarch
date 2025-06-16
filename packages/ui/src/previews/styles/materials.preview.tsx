export const PreviewProps = {
    title: "Materials",
};

export default function Preview({ ...props }) {
    return (
        <div className="w-full">
            <p>BG 1</p>

            <div className="bg-fg-1 border-stroke rounded-6 flex w-[16rem] flex-col gap-16 border p-16">
                <p>FG 1</p>
                <div className="bg-fg-2 border-stroke rounded-6 border p-16">
                    <p>FG 2</p>
                </div>
            </div>

            <div className="h-[1rem]"></div>

            <div className="bg-modal shadow-modal border-stroke rounded-6 flex w-[16rem] flex-col gap-16 border p-16">
                <p>Modal</p>
            </div>
        </div>
    );
}
