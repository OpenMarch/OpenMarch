import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMeasureStore } from "@/stores/MeasureStore";
import { usePageStore } from "@/stores/PageStore";
import React from "react";

export default function TimelineContainer({
    className = "",
}: {
    className?: string;
}) {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useMeasureStore()!;
    const { pages } = usePageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [pxPerSecond, setPxPerSecond] = React.useState(40); // scale of the timeline

    // Rerender the timeline when the measures or pages change
    React.useEffect(() => {
        // do nothing, just re-render
    }, [measures, pages]);

    return (
        <div className={`p-0 overflow-x-auto overflow-y-hidden ${className}`}>
            <div className="w-max h-full">
                {/* <div className='bg-gray-300 p w-32 mr-10 h-full' /> */}
                <div
                    className="h-full grid grid-cols-1 grid-rows-6"
                    style={{ gridTemplateColumns: "40px 1fr" }}
                >
                    <div className="fixed right-0">
                        <button
                            onClick={() => setPxPerSecond(pxPerSecond * 1.2)}
                        >
                            +
                        </button>
                        <button
                            onClick={() => setPxPerSecond(pxPerSecond * 0.8)}
                        >
                            -
                        </button>
                    </div>
                    {pages.length > 0 && (
                        <div
                            className={`flex text-2xl font-bold items-center justify-center
                        col-span-1 row-span-full cursor-pointer border-solid select-none
                        ${
                            pages[0].id === selectedPage?.id
                                ? // if the page is selected
                                  `text-gray-200 border-black
                                ${
                                    isPlaying
                                        ? "bg-purple-600 text-opacity-75"
                                        : "bg-purple-600 hover:bg-purple-800"
                                }`
                                : // if the page is not selected
                                isPlaying
                                ? "bg-purple-400"
                                : "bg-purple-300 hover:bg-purple-400"
                        }`}
                            onClick={() => setSelectedPage(pages[0])}
                            title="first page"
                            aria-label="first page"
                        >
                            <div>1</div>
                        </div>
                    )}
                    <div className="row-span-2">
                        {pages.map((page, index) => {
                            if (index === 0) return null;
                            const width = page.duration * pxPerSecond;
                            // console.log("page width", width)
                            return (
                                <div
                                    key={index}
                                    className="inline-block"
                                    style={{ width: `${width}px` }}
                                    title={`page ${page.name}`}
                                    aria-label={`page ${page.name}`}
                                >
                                    <div>
                                        <div
                                            className={` h-10 text-xl font-bold px-2 text-right transition-all
                                                duration-100 border-solid select-none ${
                                                    !isPlaying &&
                                                    "cursor-pointer"
                                                }
                                                ${
                                                    page.id === selectedPage?.id
                                                        ? // if the page is selected
                                                          `text-gray-200 border-black
                                                        ${
                                                            isPlaying
                                                                ? "bg-purple-600 text-opacity-75"
                                                                : "bg-purple-600 hover:bg-purple-800"
                                                        }`
                                                        : // if the page is not selected
                                                        isPlaying
                                                        ? "bg-purple-400"
                                                        : "bg-purple-300 hover:bg-purple-400"
                                                }`}
                                            onClick={() => {
                                                if (!isPlaying)
                                                    setSelectedPage(page);
                                            }}
                                        >
                                            <div className="static rig">
                                                {page.name}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="row-span-3">
                        {measures.map((measure, index) => {
                            const countsToUse = measure.getBigBeats();
                            const width = measure.duration * pxPerSecond;
                            const metadata = `m${measure.number} - ${
                                measure.duration
                            } seconds - ${measure.getBigBeats()} counts - time signature: ${measure.timeSignature.toString()} - tempo: ${
                                measure.tempo
                            }bpm - rehearsalMark ${measure.rehearsalMark}`;
                            // console.log("page width", width)
                            return (
                                <div
                                    key={index}
                                    className="inline-block h-fit"
                                    style={{ width: `${width}px` }}
                                    title={metadata}
                                    aria-label={metadata}
                                >
                                    <div
                                        className="grid grid-rows-3"
                                        style={{
                                            gridTemplateColumns: "1fr ".repeat(
                                                countsToUse
                                            ),
                                        }}
                                    >
                                        {Array.from(
                                            { length: countsToUse },
                                            (_, i) => (
                                                <div
                                                    key={i}
                                                    className="border-2 border-solid bg-gray-300 col-span-1 row-span-1 h-full w-full select-none"
                                                    // style={{ width: `${width / page.counts}` }}
                                                >
                                                    &nbsp;
                                                </div>
                                            )
                                        )}
                                        <div
                                            className={`text-xl text-gray-300 font-bold select-none border-solid
                                                border-black row-span-2 h-9 col-span-full bg-purple-900
                                                px-1`}
                                        >
                                            {measure.number}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
