import { useEffect, useState } from 'react';
import { Button } from './button';
import { IconCheck, IconCopy } from './icons';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through: clipboard API blocked (e.g. plain http on a LAN host) */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    // execCommand is deprecated but is the only option on non-secure origins,
    // which is common for on-prem consoles served over plain http.
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
}: {
  value: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(t);
  }, [state]);

  return (
    <Button
      size={size}
      variant="secondary"
      icon={state === 'copied' ? <IconCheck size={14} /> : <IconCopy size={14} />}
      onClick={async () => setState((await copyText(value)) ? 'copied' : 'failed')}
    >
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </span>
    </Button>
  );
}
