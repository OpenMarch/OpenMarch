// import React, { ReactNode } from 'react';
// import { render, fireEvent, renderHook, act } from '@testing-library/react';
// import RegisteredActionsHandler from '../RegisteredActionsHandler';
// import PageList from '@/components/page/PageList';
// import { IsPlayingProvider, useIsPlaying } from '@/context/IsPlayingContext';
// import { SelectedPageProvider } from '@/context/SelectedPageContext';
// import { SelectedMarchersProvider } from '@/context/SelectedMarchersContext';
// import { FieldPropertiesProvider } from '@/context/fieldPropertiesContext';
// import { ElectronApi } from 'electron/preload';
// import { mockNCAAFieldProperties } from '@/__mocks__/globalMocks';

it('passes, todo', () => {
    expect(true).toBe(true);
})

// /**
//  * TODO - figure out how the heck to test this
//  */

// describe('RegisteredActionsHandler', () => {
//     const AllProviders = ({ children }: { children: ReactNode }) => (
//         <IsPlayingProvider>
//             <SelectedPageProvider>
//                 <SelectedMarchersProvider>
//                     <FieldPropertiesProvider>
//                         {children}
//                     </FieldPropertiesProvider>
//                 </SelectedMarchersProvider>
//             </SelectedPageProvider>
//         </IsPlayingProvider >
//     );
//     window.electron = {
//         getFieldProperties: jest.fn().mockResolvedValue(mockNCAAFieldProperties),
//         sendSelectedMarchers: jest.fn(),
//         sendSelectedPage: jest.fn(),
//     } as Partial<ElectronApi> as ElectronApi;
//     it('should trigger the appropriate action when a keyboard shortcut is pressed', () => {
//         return

//         // const { result } = renderHook(() => useIsPlaying(), { wrapper: IsPlayingProvider });
//         // expect(result.current?.isPlaying).toBe(false);
//         act(() =>
//             render(<RegisteredActionsHandler />,
//                 { wrapper: AllProviders }
//             ));

//         // act(() => fireEvent.keyDown(document, { key: ' ' }));
//         // expect(result.current?.isPlaying).toBe(true);

//         // TODO: Write test case to simulate keyboard shortcut and assert the action is triggered correctly
//     });

//     it('should trigger the correct action based on enum', () => {
//         // TODO: Write test case to trigger an action based on enum and assert the correct action is triggered
//     });

//     it('should trigger the correct action when a registered button is clicked', () => {
//         // TODO: Write test case to simulate button click and assert the correct action is triggered
//     });
// });
