import useMeasureStore from '@/stores/measure/useMeasureStore';
import React, { useEffect } from 'react';

export default function TimelineContainer() {
    const { measures } = useMeasureStore()!;

    useEffect(() => {
        console.log("TIMELINE CONTAINER", measures);
    })
    return (
        <div style={{ overflowX: 'scroll', width: '100%', position: 'fixed', bottom: 0, backgroundColor: 'gray' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100px', height: '100px', backgroundColor: 'red', marginRight: '10px' }}>
                    {/* Content for count */}
                </div>
                <div style={{ width: '100px', height: '100px', backgroundColor: 'blue', marginRight: '10px' }}>
                    {/* Content for measure */}
                </div>
                <div style={{ width: '100px', height: '100px', backgroundColor: 'green', marginRight: '10px' }}>
                    {/* Content for page */}
                </div>
                {/* Add more boxes as needed */}
            </div>
        </div>
    );
}
