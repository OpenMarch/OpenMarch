export const PreviewProps = {
    title: "Colors",
};

export default function Preview({ ...props }) {
    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex w-[16rem] flex-col gap-16 border p-16">
            Colors
            <div className="bg-accent border-stroke rounded-6 text-text-invert border p-16">
                Accent
            </div>
            <div className="bg-red border-stroke rounded-6 text-text-invert border p-16">
                Red
            </div>
            <div className="bg-yellow border-stroke rounded-6 text-text-invert border p-16">
                Yellow
            </div>
            <div className="bg-green border-stroke rounded-6 text-text-invert border p-16">
                Green
            </div>
        </div>
    );
}
