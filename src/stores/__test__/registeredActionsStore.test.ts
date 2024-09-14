import { act, renderHook } from '@testing-library/react';
import { useRegisteredActionsStore } from '../useRegisteredActionsStore';
import { RegisteredActionsEnum } from '@/utilities/RegisteredActionsHandler';
import {
    describe,
    expect,
    it,
} from "vitest";

describe('registeredActionsStoreCreator', () => {
    it('should initialize the store with an empty array of registeredButtonActions', () => {
        const { result } = renderHook(() => useRegisteredActionsStore());

        expect(result.current.registeredButtonActions).toEqual([]);
    });

    it('should add a registered action and button reference to the store', () => {
        const { result } = renderHook(() => useRegisteredActionsStore());
        const button = document.body.appendChild(document.createElement('button'));

        const registeredAction = RegisteredActionsEnum.nextPage;
        const buttonRef = { current: button };

        act(() => result.current.linkRegisteredAction(registeredAction, buttonRef));

        expect(result.current.registeredButtonActions).toEqual([{ registeredAction, buttonRef }]);

        // cleanup
        document.body.removeChild(button);
        act(() => result.current.removeRegisteredAction(registeredAction, buttonRef));
    });

    it('should add multiple registered actions and button references to the store', () => {
        const { result } = renderHook(() => useRegisteredActionsStore());

        const registeredAction1 = RegisteredActionsEnum.nextPage;
        const button1 = document.body.appendChild(document.createElement('button'));
        const buttonRef1 = { current: document.createElement('button') };

        const registeredAction2 = RegisteredActionsEnum.lockX;
        const button2 = document.body.appendChild(document.createElement('button'));
        const buttonRef2 = { current: document.createElement('button') };

        act(() => result.current.linkRegisteredAction(registeredAction1, buttonRef1));
        act(() => result.current.linkRegisteredAction(registeredAction2, buttonRef2));

        expect(result.current.registeredButtonActions).toEqual([
            { registeredAction: registeredAction1, buttonRef: buttonRef1 },
            { registeredAction: registeredAction2, buttonRef: buttonRef2 },
        ]);

        // cleanup
        document.body.removeChild(button1);
        document.body.removeChild(button2);
        act(() => result.current.removeRegisteredAction(registeredAction1, buttonRef1));
        act(() => result.current.removeRegisteredAction(registeredAction2, buttonRef2));

    });
});
