'use client';
// One-line text box that grows taller when the text wraps (so tables fit the screen without side-scrolling).
// Enter never adds a new line (it is used to move / save in tables).
import { forwardRef, useEffect, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react';

export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoTextarea({ className = '', onKeyDown, value, ...rest }, ref) {
  const el = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => el.current!);
  const fit = () => {
    const t = el.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  };
  useEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <textarea
      ref={el}
      rows={1}
      value={value}
      className={`block resize-none overflow-hidden ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
        onKeyDown?.(e);
      }}
      onInput={fit}
      {...rest}
    />
  );
});
