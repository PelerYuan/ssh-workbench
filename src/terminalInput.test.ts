import { describe, expect, it } from 'vitest';
import { applyOneShotModifiers, updateOneShotModifiers } from './terminalInput';

describe('applyOneShotModifiers', () => {
  it('turns a letter into a control character', () => {
    expect(applyOneShotModifiers('c', true, false)).toBe('\x03');
    expect(applyOneShotModifiers('/', true, false)).toBe('\x1f');
  });

  it('prefixes regular Alt input with escape', () => {
    expect(applyOneShotModifiers('x', false, true)).toBe('\x1bx');
  });

  it('encodes Ctrl and Alt modifiers for navigation keys', () => {
    expect(applyOneShotModifiers('\x1b[D', true, false)).toBe('\x1b[1;5D');
    expect(applyOneShotModifiers('\x1b[6~', false, true)).toBe('\x1b[6;3~');
    expect(applyOneShotModifiers('\x1b[A', true, true)).toBe('\x1b[1;7A');
  });

  it('leaves input unchanged when modifiers are off', () => {
    expect(applyOneShotModifiers('\x1b[A', false, false)).toBe('\x1b[A');
  });

  it('clears selected one-shot modifiers when the connection becomes unavailable', () => {
    const ctrl = updateOneShotModifiers({ ctrl: false, alt: false }, 'toggleCtrl');
    const ctrlAlt = updateOneShotModifiers(ctrl, 'toggleAlt');

    expect(ctrlAlt).toEqual({ ctrl: true, alt: true });
    expect(updateOneShotModifiers(ctrlAlt, 'clear')).toEqual({ ctrl: false, alt: false });
  });
});
