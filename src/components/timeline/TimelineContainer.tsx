import { useSelectedPage } from '@/context/SelectedPageContext';
// import { useMeasureStore } from '@/stores/measure/useMeasureStore';
import { usePageStore } from '@/stores/page/usePageStore';
import React from 'react';

export default function TimelineContainer({ className = "" }: { className?: string }) {
    // const { measures } = useMeasureStore()!;
    const { pages } = usePageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [pxPerSecond, setPxPerSecond] = React.useState(40); // scale of the timeline

    return (
        <div className={`p-0 overflow-scroll ${className}`} >
            <div className='w-max h-full'>
                {/* {measures.map((measure, index) => {
                return (
                    <div key={index} className='bg-gray-300 p w-32 mr-10 h-full'>
                        <div className='text-center'>{measure.id}</div>
                    </div>
                );

            })} */}
                {/* <div className='bg-gray-300 p w-32 mr-10 h-full' /> */}
                <div className='h-full grid grid-cols-1 grid-rows-3'>
                    <div className='h-full row-span-2'>
                        {pages.map((page, index) => {
                            const nextPage = page.getNextPage(pages);
                            const countsToUse = nextPage !== null ? page.counts : 2;
                            const tempoToUse = nextPage !== null ? nextPage.tempo : 120;
                            const width = countsToUse * (60 / tempoToUse) * pxPerSecond;
                            return (
                                <div key={index} className='inline-block' style={{ width: `${width}px` }}>
                                    <div className='grid' style={{ gridTemplateRows: "1fr 1fr", gridTemplateColumns: "1fr ".repeat(page.counts) }}>
                                        <div
                                            title='page container' aria-label='page container'
                                            className={
                                                `h-10 text-xl text-center font-bold
                                            transition-all duration-100 border-solid
                                            cursor-pointer col-span-full
                                            ${page.id === selectedPage?.id ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-300 hover:bg-purple-400'}`
                                            }
                                            onClick={() => setSelectedPage(page)}
                                        >
                                            {page.name}
                                        </div>
                                        {page.getNextPage(pages) !== null && Array.from({ length: page.counts }, (_, i) => (
                                            <div
                                                key={i}
                                                className='border-2 border-solid bg-gray-300 col-span-1 w-full select-none'
                                            // style={{ width: `${width / page.counts}` }}
                                            >&nbsp;</div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* <div>
                        {measures.map((measure, index) => {
                            console.log(measure)
                            const width = measure.duration * pxPerSecond;
                            return (
                                <div key={index} className={
                                    `inline-block bg-gray-300
                                    transition-all duration-100 border-solid h-full cursor-default`
                                }
                                    style={{ width: `${width}px` }}
                                >
                                    <div className='text-center'>{measure.number}</div>
                                </div>
                            );
                        })}
                    </div> */}
                </div>
            </div>
        </div>
    );
}
