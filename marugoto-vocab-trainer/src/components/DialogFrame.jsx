import React, { useEffect, useRef } from 'react';

export function DialogFrame({
  label,
  onClose,
  busy = false,
  suspended = false,
  className = '',
  children,
}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const suspendedRef = useRef(suspended);
  closeRef.current = onClose;
  busyRef.current = busy;
  suspendedRef.current = suspended;
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    const focusable = () =>
      [
        ...root.querySelectorAll(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length);
    (focusable()[0] || root).focus();
    function onKey(event) {
      if (suspendedRef.current || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current?.();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          root.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !root.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !root.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      inert={suspended}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`modal-card ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
