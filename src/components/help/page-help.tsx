import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { PAGE_HELP } from '@/lib/pageHelp';
import { Drawer } from '../ui';
import { IconHelp } from '../ui/icons';
import { LearnMore } from './learn-more';

/** The route id of the page on screen (the deepest match). */
function useRouteId(): string | undefined {
  return useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.routeId });
}

/**
 * The "?" help button in the header: in the same place on every page (WCAG
 * 3.2.6, consistent help). It opens a panel about the page on screen; nothing
 * opens by itself.
 */
export function PageHelpButton() {
  const routeId = useRouteId();
  const help = routeId ? PAGE_HELP[routeId] : undefined;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <IconHelp size={16} />
        {/* sr-only, not hidden, on phones: the icon-only button keeps its name. */}
        <span className="sr-only sm:not-sr-only">Help</span>
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={help ? `Help: ${help.title}` : 'Help'}
        description="About this page. The docs open in a new tab."
      >
        {help ? (
          <div className="flex flex-col gap-4 text-[13px]">
            <p>{help.purpose}</p>
            <section aria-labelledby="help-tasks">
              <h3 id="help-tasks" className="mb-1.5 text-[12.5px] font-semibold">
                What you can do here
              </h3>
              <ul className="list-disc pl-5 text-fg-muted">
                {help.tasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="help-docs">
              <h3 id="help-docs" className="mb-1.5 text-[12.5px] font-semibold">
                In the docs
              </h3>
              <ul className="flex flex-col gap-1">
                {help.links.map((l) => (
                  <li key={l.label}>
                    <LearnMore doc={l.doc}>{l.label}</LearnMore>
                  </li>
                ))}
              </ul>
            </section>
            <p className="text-[12.5px] text-fg-muted">
              Press <kbd className="rounded border border-border px-1 font-mono">Ctrl K</kbd> (
              <kbd className="rounded border border-border px-1 font-mono">⌘ K</kbd> on a Mac) to
              find any page or action, including by its old name.
            </p>
          </div>
        ) : (
          <p className="text-[13px]">
            <LearnMore doc={{ page: 'start' }}>Where to begin</LearnMore>
          </p>
        )}
      </Drawer>
    </>
  );
}
