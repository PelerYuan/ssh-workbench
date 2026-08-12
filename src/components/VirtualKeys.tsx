import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus } from 'lucide-react';

type VirtualKey = {
  label: string;
  data?: string;
  icon?: typeof ArrowUp;
  className?: string;
  modifier?: 'ctrl' | 'alt';
};

const rows: VirtualKey[][] = [
  [
    { label: 'ESC', data: '\x1b' },
    { label: '/', data: '/' },
    { label: '-', data: '-', icon: Minus },
    { label: 'HOME', data: '\x1b[H' },
    { label: 'UP', data: '\x1b[A', icon: ArrowUp, className: 'key--arrow' },
    { label: 'END', data: '\x1b[F' },
    { label: 'PGUP', data: '\x1b[5~' },
  ],
  [
    { label: 'TAB', data: '\t' },
    { label: 'CTRL', modifier: 'ctrl', className: 'key--modifier' },
    { label: 'ALT', modifier: 'alt', className: 'key--modifier' },
    { label: 'LEFT', data: '\x1b[D', icon: ArrowLeft, className: 'key--arrow' },
    { label: 'DOWN', data: '\x1b[B', icon: ArrowDown, className: 'key--arrow' },
    { label: 'RIGHT', data: '\x1b[C', icon: ArrowRight, className: 'key--arrow' },
    { label: 'PGDN', data: '\x1b[6~' },
  ],
];

interface VirtualKeysProps {
  ctrl: boolean;
  alt: boolean;
  disabled?: boolean;
  onModifier: (modifier: 'ctrl' | 'alt') => void;
  onData: (data: string) => void;
}

export function VirtualKeys({ ctrl, alt, disabled = false, onModifier, onData }: VirtualKeysProps) {
  const send = (key: VirtualKey) => {
    if (key.modifier === 'ctrl') {
      onModifier('ctrl');
      return;
    }
    if (key.modifier === 'alt') {
      onModifier('alt');
      return;
    }
    if (key.data) onData(key.data);
  };

  return (
    <div className="virtual-keys" aria-label="终端快捷键">
      {rows.map((row, rowIndex) => (
        <div className="virtual-keys__row" key={rowIndex}>
          {row.map((key) => {
            const Icon = key.icon;
            const active = !disabled && (key.modifier === 'ctrl' ? ctrl : key.modifier === 'alt' ? alt : false);
            return (
              <button
                key={key.label}
                className={`terminal-key ${key.className ?? ''} ${active ? 'is-active' : ''}`}
                type="button"
                aria-label={key.label}
                aria-pressed={key.modifier ? active : undefined}
                disabled={disabled}
                onClick={() => send(key)}
              >
                {Icon ? <Icon aria-hidden="true" size={16} /> : key.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
