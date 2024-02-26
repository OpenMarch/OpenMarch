import { KeyboardAction } from '@/global/classes/KeyboardAction';
import { useKeyboardActionsStore } from '../useKeyboardActionsStore';
import { act, renderHook } from '@testing-library/react';

describe('useKeyboardActionsStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useKeyboardActionsStore());
    const definedKeyboardActions: { [key: string]: KeyboardAction } = {
      action1: new KeyboardAction({ key: 'A', desc: 'Action 1' }),
      action2: new KeyboardAction({ key: 'B', desc: 'Action 2' })
    };

    act(() => result.current.initKeyboardActions(definedKeyboardActions));
  });

  it('should initialize keyboardActions correctly', () => {
    const { result } = renderHook(() => useKeyboardActionsStore());
    const definedKeyboardActions: { [key: string]: KeyboardAction } = {
      action1: new KeyboardAction({ key: 'A', desc: 'Action 1' }),
      action2: new KeyboardAction({ key: 'B', desc: 'Action 2' })
    };

    result.current.initKeyboardActions(definedKeyboardActions);

    expect(useKeyboardActionsStore.getState().keyboardActions).toEqual({
      A: expect.any(Function),
      B: expect.any(Function),
    });
  });

  it('should register a keyboard action correctly', () => {
    const { result } = renderHook(() => useKeyboardActionsStore());

    const key = 'A';
    const action = jest.fn();

    act(() => result.current.registerKeyboardAction(key, action));

    expect(useKeyboardActionsStore.getState().keyboardActions[key]).toBe(action);
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
