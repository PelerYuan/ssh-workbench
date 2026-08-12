import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'small' | 'medium';
  locked?: boolean;
}

export function Dialog({ title, description, children, footer, onClose, size = 'medium', locked = false }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => !element.hidden);
    const frame = window.requestAnimationFrame(() => {
      if (!dialogRef.current?.contains(document.activeElement)) focusable()[0]?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!locked) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Detect virtual keyboard on mobile
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const viewport = window.visualViewport;
      const handleResize = () => {
        const heightDifference = window.innerHeight - viewport.height;
        setKeyboardVisible(heightDifference > 150);
      };
      viewport.addEventListener('resize', handleResize);
      viewport.addEventListener('scroll', handleResize);
      handleResize();
      return () => {
        window.cancelAnimationFrame(frame);
        document.removeEventListener('keydown', onKeyDown);
        viewport.removeEventListener('resize', handleResize);
        viewport.removeEventListener('scroll', handleResize);
        previousFocus?.focus();
      };
    }

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [locked, onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (!locked && event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className={`dialog dialog--${size} ${keyboardVisible ? 'dialog--keyboard-visible' : ''}`}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={locked} aria-label="关闭">
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </section>
    </div>
  );
}
