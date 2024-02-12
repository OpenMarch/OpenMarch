// import React from 'react';
// import { render, screen, fireEvent } from '@testing-library/react';
// import { Button } from 'react-bootstrap';
// import { FaPause, FaPlay } from 'react-icons/fa';
// import { useSelectedPage } from "@/context/SelectedPageContext";
// import { usePageStore } from "@/stores/uiSettings/useUiSettingsStore";
// import { useIsPlaying } from "@/context/IsPlayingContext";
// import PlaybackControls from '../PlaybackControls';

jest.mock("../../context/SelectedPageContext");
jest.mock("../../global/Store");
jest.mock("../../context/IsPlayingContext");

// describe('PlaybackControls', () => {
//     beforeEach(() => {
//         useSelectedPage.mockReturnValue({
//             selectedPage: { order: 1 },
//             setSelectedPage: jest.fn(),
//         });

//         usePageStore.mockReturnValue({
//             pages: [{ order: 1 }, { order: 2 }],
//         });

//         useIsPlaying.mockReturnValue({
//             isPlaying: false,
//             setIsPlaying: jest.fn(),
//         });
//     });


// });
