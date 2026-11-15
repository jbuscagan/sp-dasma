'use client';
// One look for every "Generate" button in the system (always the same icon, label and colour).
import type { ComponentProps } from 'react';
import { Button } from './index';
import { Icon } from './Icon';

export function GenerateButton({ label = 'Generate', count, ...rest }: ComponentProps<typeof Button> & { label?: string; count?: number }) {
  return (
    <Button {...rest}>
      <Icon name="download" size={16} />
      {label}
      {count ? ` (${count})` : ''}
    </Button>
  );
}
