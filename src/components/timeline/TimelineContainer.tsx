import { useSelectedPage } from '@/context/SelectedPageContext';
import BeatUnit from '@/global/classes/BeatUnit';
import { useMeasureStore } from '@/stores/measure/useMeasureStore';
import { usePageStore } from '@/stores/page/usePageStore';
import React from 'react';

export default function TimelineContainer({ className = "" }: { className?: string }) {
    const { measures } = useMeasureStore()!;
    const { pages } = usePageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [pxPerSecond, setPxPerSecond] = React.useState(40); // scale of the timeline

    return (
        <div className={`p-0 overflow-x-scroll overflow-y-hidden ${className}`} >
            <div className='w-max h-full'>
                {/* <div className='bg-gray-300 p w-32 mr-10 h-full' /> */}
                <div className='h-full grid grid-cols-1 grid-rows-5' style={{ gridTemplateColumns: '40px 1fr' }}>
                    {pages.length > 0 &&
                        <div className={`flex text-2xl font-bold items-center justify-center
                        col-span-1 row-span-full cursor-pointer border-solid
                        ${pages[0].id === selectedPage?.id ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-300 hover:bg-purple-400'}`}
                            onClick={() => setSelectedPage(pages[0])}

                            title='first page' aria-label='first page'>
                            <div>1</div>
                        </div>
                    }
                    <div className='row-span-2'>
                        {pages.map((page, index) => {
                            if (index === 0) return null;
                            // if (page.measures.length > 0) {
                            //     console.log("PAGE", page.name, page.duration)
                            //     for (const measure of page.measures) {
                            //         console.log("measure", measure.number)
                            //         console.log("duration", measure.duration)
                            //         console.log("big beats", measure.getBigBeats())
                            //     }
                            // }
                            const width = page.duration * pxPerSecond;
                            // console.log("page width", width)
                            return (
                                <div key={index} className='inline-block' style={{ width: `${width}px` }}
                                    title={`page ${page.name}`} aria-label={`page ${page.name}`}>
                                    <div>
                                        <div
                                            className={`flex items-center h-10 text-xl font-bold px-2 justify-end
                                                transition-all duration-100 border-solid cursor-pointer
                                        ${page.id === selectedPage?.id ? 'bg-purple-600 hover:bg-purple-800 text-gray-200 border-black' : 'bg-purple-300 hover:bg-purple-400'}`
                                            }
                                            onClick={() => setSelectedPage(page)}
                                        >
                                            <div className='static rig'>
                                                {page.name}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className='row-span-3'>
                        {measures.map((measure, index) => {
                            // if (page.measures.length > 0) {
                            //     console.log("PAGE", page.name, page.duration)
                            //     for (const measure of page.measures) {
                            //         console.log("measure", measure.number)
                            //         console.log("duration", measure.duration)
                            //         console.log("big beats", measure.getBigBeats())
                            //     }
                            // }
                            const countsToUse = measure.getBigBeats();
                            const width = measure.duration * pxPerSecond;
                            const metadata = `m${measure.number} - ${measure.duration} seconds - ${measure.getBigBeats()} counts - time signature: ${measure.timeSignature.toString()} - tempo: ${measure.tempo}bpm - rehearsalMark ${measure.rehearsalMark}`
                            // console.log("page width", width)
                            return (
                                <div key={index} className='inline-block h-fit' style={{ width: `${width}px` }}
                                    title={metadata} aria-label={metadata}>
                                    <div className='grid grid-rows-3' style={{ gridTemplateColumns: "1fr ".repeat(countsToUse) }}>
                                        {Array.from({ length: countsToUse }, (_, i) => (
                                            <div
                                                key={i}
                                                className='border-2 border-solid bg-gray-300 col-span-1 row-span-1 h-full w-full select-none'
                                            // style={{ width: `${width / page.counts}` }}
                                            >&nbsp;</div>
                                        ))}
                                        <div
                                            className={
                                                `text-xl text-gray-300 font-bold select-none border-solid
                                                border-black row-span-2 h-9 col-span-full bg-purple-900
                                                flex items-center px-1`
                                            }
                                        >
                                            {measure.number}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* <div>
                        {measures.map((measure, index) => {
                            const width = measure.duration * pxPerSecond;
                            // console.log("measure width", width)
                            return (
                                <div key={index} className={
                                    `inline-block bg-purple-600
                                    transition-all duration-100 border-solid h-full cursor-default`
                                }
                                    style={{ width: `${width}px` }}
                                >
                                    <div className='select-none text-xl text-left text-white h-full px-2 w-min font-bold'>
                                        <span>{measure.number}</span>
                                        {measure.rehearsalMark && <span>-asdf {measure.rehearsalMark}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div> */}
                </div>
            </div>
        </div >
    );
}
