function modifiedCsi(data: string, modifier: number): string | null {
  const simple = /^\x1b\[([A-DFH])$/.exec(data);
  if (simple) return `\x1b[1;${modifier}${simple[1]}`;

  const tilde = /^\x1b\[(\d+)~$/.exec(data);
  if (tilde) return `\x1b[${tilde[1]};${modifier}~`;
  return null;
}

export interface OneShotModifiers {
  ctrl: boolean;
  alt: boolean;
}

export type OneShotModifierAction = 'toggleCtrl' | 'toggleAlt' | 'clear';

export function updateOneShotModifiers(state: OneShotModifiers, action: OneShotModifierAction): OneShotModifiers {
  if (action === 'toggleCtrl') return { ...state, ctrl: !state.ctrl };
  if (action === 'toggleAlt') return { ...state, alt: !state.alt };
  return state.ctrl || state.alt ? { ctrl: false, alt: false } : state;
}

export function applyOneShotModifiers(data: string, ctrl: boolean, alt: boolean): string {
  if (!ctrl && !alt) return data;
  const modifier = ctrl && alt ? 7 : ctrl ? 5 : 3;
  const csi = modifiedCsi(data, modifier);
  if (csi) return csi;

  let result = data;
  if (ctrl && result.length === 1) {
    if (result === '/') {
      result = '\x1f';
    } else if (result === '?') {
      result = '\x7f';
    } else {
      const code = result.toUpperCase().charCodeAt(0);
      if (code >= 64 && code <= 95) result = String.fromCharCode(code & 0x1f);
    }
  }
  return alt ? `\x1b${result}` : result;
}
