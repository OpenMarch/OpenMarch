import { useKeyboardActionsStore } from '../useKeyboardActionsStore';
import { act, renderHook } from '@testing-library/react';
import { DefinedKeyboardActions } from '@/KeyboardListeners';

describe('useKeyboardActionsStore', () => {
  it('should initialize keyboardActions correctly', () => {
    const { result } = renderHook(() => useKeyboardActionsStore());

    act(() => result.current.initKeyboardActions(DefinedKeyboardActions));

    const expected: { [key: string]: () => any } = {};
    for (const action of Object.values(DefinedKeyboardActions)) {
      expected[action.keyString] = expect.any(Function);
    }

    expect(useKeyboardActionsStore.getState().keyboardActions).toEqual(expected);
  });


  it('should register a keyboard action correctly', () => {
    const { result } = renderHook(() => useKeyboardActionsStore());

    const key = DefinedKeyboardActions.lockX.keyString;
    const action = jest.fn();

    act(() => result.current.initKeyboardActions(DefinedKeyboardActions));
    act(() => result.current.registerKeyboardAction(key, action));

    const keyboardActions = useKeyboardActionsStore.getState().keyboardActions;
    expect(keyboardActions[key]).toBe(action);
  });

  it('should throw an error when registering an undefined keyboard action', () => {
    const { result } = renderHook(() => useKeyboardActionsStore());

    const key = 'C';
    const action = jest.fn();

    expect(() => {
      result.current.registerKeyboardAction(key, action);
    }).toThrowError(`No keyboardAction registered for ${key}. This action must be defined in DefinedKeyboardActions.`);
  });
});
