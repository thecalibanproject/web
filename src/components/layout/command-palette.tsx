import { useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { cn } from '@/lib/cn';
import { docsHref } from '@/lib/docs';
import { GLOSSARY, type GlossaryId } from '@/lib/glossary';
import { rankCommands, type PaletteCommand, type RankedCommand } from '@/lib/palette';
import { setWorkspace, useWorkspace } from '@/lib/workspace';
import { Drawer } from '../ui';
import { IconSearch } from '../ui/icons';
import { ADMIN_NAV, DAILY_NAV, type NavTo } from './nav';

/** Where each glossary term is worked with, for "go to" from the palette. */
const TERM_PAGE: Partial<Record<GlossaryId, NavTo>> = {
  workspace: '/tenants',
  assistant: '/nodes',
  topic: '/tenants',
  dataDictionary: '/ontology',
  dataConnection: '/datasources',
  knowledge: '/rag',
  connectedSystem: '/tools',
  conversation: '/runs',
  approvals: '/inbox',
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Cmd/Ctrl+K: every page, the main actions, workspace switching and the
 * glossary, searchable by old names too. An APG combobox (input with
 * `aria-activedescendant` over a listbox) inside a modal dialog; built in-house
 * because cmdk has had no release since 2025-03 (research note 10, section 7).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg sm:w-64"
      >
        <IconSearch size={14} className="shrink-0" />
        <span className="hidden truncate sm:inline">Search or jump to</span>
        <span className="sr-only sm:hidden">Search or jump to</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border px-1 font-mono text-[11px] whitespace-nowrap sm:inline">
          {isMac() ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="center" title="Search or jump to">
        {open && <Palette onDone={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

function Palette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const ws = useWorkspace();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (to: NavTo, search?: Record<string, unknown>) => () =>
      void navigate({ to, search: search as never });
    const pages = [...DAILY_NAV, ...ADMIN_NAV]
      .filter((n) => !n.perm || perms.canSomewhere(n.perm))
      .map<PaletteCommand>((n) => ({
        id: `page:${n.to}`,
        label: n.label,
        group: 'Pages',
        aliases: n.also,
        boost: 20,
        run: go(n.to),
      }));
    const actions: PaletteCommand[] = [];
    if (perms.canSomewhere('nodes.write')) {
      actions.push({
        id: 'act:new-assistant',
        label: 'New assistant',
        group: 'Actions',
        aliases: ['create node', 'template', 'new node'],
        run: go('/nodes', { new: 1 }),
      });
    }
    if (perms.canSomewhere('runs.read')) {
      actions.push({
        id: 'act:approvals',
        label: 'Review waiting approvals',
        group: 'Actions',
        aliases: ['inbox', 'approve', 'deny', 'reject'],
        run: go('/inbox'),
      });
    }
    actions.push({
      id: 'act:setup',
      label: 'Setup checklist',
      group: 'Actions',
      aliases: ['get started', 'onboarding', 'first steps'],
      run: go('/'),
    });
    if (perms.canSomewhere('catalog.write')) {
      actions.push({
        id: 'act:add-model',
        label: 'Add a model server',
        group: 'Actions',
        aliases: ['provider', 'vllm', 'ollama'],
        run: go('/models', { tab: 'servers' }),
      });
    }
    const workspaces = ws.list.map<PaletteCommand>((t) => ({
      id: `ws:${t.id}`,
      label: `Switch to ${t.name}`,
      group: 'Workspaces',
      aliases: [t.id],
      hint: t.id === ws.id ? 'Current' : undefined,
      run: () => setWorkspace(t.id),
    }));
    const terms = (
      Object.entries(GLOSSARY) as Array<[GlossaryId, (typeof GLOSSARY)[GlossaryId]]>
    ).map<PaletteCommand>(([id, e]) => {
      const page = TERM_PAGE[id];
      return {
        id: `term:${id}`,
        label: e.label,
        group: 'Terms',
        aliases: e.also,
        hint: e.definition,
        run: page
          ? go(page)
          : () => {
              window.open(docsHref(e.doc), '_blank', 'noopener');
            },
      };
    });
    return [...pages, ...actions, ...workspaces, ...terms];
  }, [navigate, perms, ws.list, ws.id]);

  // A conversation id typed or pasted opens it in the current workspace.
  const runId = /^run_[A-Za-z0-9]{6,}$/.test(query.trim()) ? query.trim() : null;
  const openRun: PaletteCommand[] =
    runId && ws.id
      ? [
          {
            id: `run:${runId}`,
            label: `Open conversation ${runId}`,
            group: 'Actions',
            run: () =>
              void navigate({
                to: '/runs/$tenantId/$runId',
                params: { tenantId: ws.id!, runId },
              }),
          },
        ]
      : [];
  const results: RankedCommand[] = [
    ...openRun.map((command) => ({ command })),
    ...rankCommands(commands, query, 14),
  ];
  const current = Math.min(active, Math.max(0, results.length - 1));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    onDone();
    r.command.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') setActive((current + 1) % Math.max(1, results.length));
    else if (e.key === 'ArrowUp')
      setActive((current - 1 + results.length) % Math.max(1, results.length));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(results.length - 1);
    else if (e.key === 'Enter') choose(current);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        data-autofocus
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results.length ? optionId(current) : undefined}
        aria-label="Search pages, actions, workspaces and terms"
        placeholder="Pages, actions, workspaces, terms (old names work too)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-[13.5px] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-ring"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Results"
        className="flex max-h-96 flex-col overflow-y-auto"
      >
        {results.map((r, i) => (
          // Options are picked with the keyboard through the combobox, or clicked.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={r.command.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(i)}
            className={cn(
              'flex cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-1.5 text-[13px]',
              i === current ? 'bg-accent-soft text-fg' : 'text-fg',
            )}
          >
            <span className="w-20 shrink-0 text-[11.5px] text-fg-muted">{r.command.group}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.command.label}</span>
              {r.via && <span className="text-fg-muted"> (also called {r.via})</span>}
              {r.command.hint && (
                <span className="block truncate text-[12px] text-fg-muted">{r.command.hint}</span>
              )}
            </span>
          </li>
        ))}
        {results.length === 0 && (
          <li
            role="option"
            aria-selected={false}
            aria-disabled
            className="px-2.5 py-3 text-[13px] text-fg-muted"
          >
            Nothing matches. Try another word.
          </li>
        )}
      </ul>
      <p className="text-[12px] text-fg-muted">Arrow keys move, Enter opens, Escape closes.</p>
    </div>
  );
}
