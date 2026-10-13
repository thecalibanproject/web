import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuthState } from '@/api/auth';
import {
  currentPhase,
  phaseDone,
  type ChecklistItem,
  type ChecklistPhase,
  type SetupFacts,
} from '@/lib/checklist';
import { setupPhases } from '@/lib/checklist';
import { cn } from '@/lib/cn';
import { readStorage, writeStorage } from '@/lib/storage';
import { LearnMore } from '../help/learn-more';
import { Button, Card, CardHeader } from '../ui';
import { IconCheck, IconCircle } from '../ui/icons';

interface Prefs {
  hidden: boolean;
  /** Phases the user closed. */
  closed: string[];
}

const keyFor = (who: string) => `caliban.checklist.${who}`;

/** The user's checklist preferences (per user, per browser). Never throws. */
function readChecklistPrefs(who: string): Prefs {
  try {
    const raw = readStorage('local', keyFor(who));
    const v = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { hidden: v.hidden === true, closed: Array.isArray(v.closed) ? v.closed : [] };
  } catch {
    return { hidden: false, closed: [] };
  }
}

function writePrefs(who: string, prefs: Prefs) {
  writeStorage('local', keyFor(who), JSON.stringify(prefs));
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} done`}
      className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className="h-full origin-left rounded-full bg-ok transition-transform duration-(--duration-slow) ease-(--ease-standard)"
        style={{ transform: `scaleX(${total ? done / total : 0})` }}
      />
    </div>
  );
}

function Item({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-moderate)',
          item.done ? 'bg-ok text-surface' : 'text-fg-muted',
        )}
      >
        {item.done ? <IconCheck size={13} /> : <IconCircle size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-medium', item.done && 'text-fg-muted')}>
          {item.title}
          <span className="sr-only">{item.done ? ': done' : ': to do'}</span>
        </p>
        {!item.done && <p className="text-[12.5px] text-fg-muted">{item.how}</p>}
      </div>
      {!item.done && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 text-[12.5px]">
          <Link
            {...item.link}
            className="font-medium text-accent hover:underline"
          >
            {item.action}
          </Link>
          <LearnMore doc={item.doc} className="text-fg-muted" />
        </div>
      )}
    </li>
  );
}

function Phase({
  phase,
  open,
  onToggle,
}: {
  phase: ChecklistPhase;
  open: boolean;
  onToggle: () => void;
}) {
  const done = phase.items.filter((i) => i.done).length;
  const id = `phase-${phase.id}`;
  return (
    <section aria-labelledby={`${id}-h`} className="border-t border-border first:border-t-0">
      <h3 id={`${id}-h`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">{phase.title}</span>
            <span className="block text-[12.5px] font-normal text-fg-muted">
              {phaseDone(phase) ? 'All done.' : phase.description}
            </span>
          </span>
          <span className="text-[12px] text-fg-muted tabular-nums">
            {done} of {phase.items.length}
          </span>
          <Progress label={`${phase.title}: progress`} done={done} total={phase.items.length} />
        </button>
      </h3>
      {open && (
        <ul id={id} className="divide-y divide-border px-4 pb-1 motion-safe:animate-fade-in">
          {phase.items.map((i) => (
            <Item key={i.id} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Get set up" on Home: phased, derived from live state, dismissable and
 * remembered per user. No tour starts by itself; each step links to the page
 * that does it and to its docs.
 */
export function SetupChecklist({
  facts,
  workspaceId,
}: {
  facts: SetupFacts;
  workspaceId: string | undefined;
}) {
  const who = useAuthState()?.principal?.me?.actor ?? 'admin-token';
  const [prefs, setPrefs] = useState(() => readChecklistPrefs(who));
  const phases = setupPhases(facts, workspaceId);
  const current = currentPhase(phases);
  const [opened, setOpened] = useState<string[]>([]);
  const update = (p: Prefs) => {
    setPrefs(p);
    writePrefs(who, p);
  };

  if (phases.length === 0) return null;
  if (prefs.hidden) {
    return (
      <p className="mb-6 text-[12.5px] text-fg-muted">
        The setup checklist is hidden.{' '}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => update({ ...prefs, hidden: false })}
        >
          Show it again
        </button>
      </p>
    );
  }
  const total = phases.reduce((n, p) => n + p.items.length, 0);
  const done = phases.reduce((n, p) => n + p.items.filter((i) => i.done).length, 0);
  const isOpen = (p: ChecklistPhase) =>
    opened.includes(p.id) || (p.id === current?.id && !prefs.closed.includes(p.id));
  return (
    <Card role="region" aria-label="Get set up" className="mb-6">
      <CardHeader
        title={current ? 'Get set up' : 'Setup is complete'}
        description={
          current
            ? `${done} of ${total} steps done. Each step turns green by itself once it is true.`
            : 'Everything on the checklist is in place.'
        }
        actions={
          <Button size="sm" variant="ghost" onClick={() => update({ ...prefs, hidden: true })}>
            Hide checklist
          </Button>
        }
      />
      {phases.map((p) => (
        <Phase
          key={p.id}
          phase={p}
          open={isOpen(p)}
          onToggle={() => {
            if (isOpen(p)) {
              setOpened((o) => o.filter((x) => x !== p.id));
              update({ ...prefs, closed: [...new Set([...prefs.closed, p.id])] });
            } else {
              setOpened((o) => [...o, p.id]);
              update({ ...prefs, closed: prefs.closed.filter((x) => x !== p.id) });
            }
          }}
        />
      ))}
    </Card>
  );
}
