/**
 * Ranking for the command palette: every command has a label and old names
 * (aliases), so "CQIR", "tenant" or "inbox" still find the renamed thing
 * (research note 10, section 7). Plain substring matching, ranked; no fuzzy
 * library needed for a few dozen commands.
 */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Group heading: Pages, Actions, Workspaces, Terms. */
  group: string;
  /** Searched too, and shown as "also called" when it is what matched. */
  aliases?: readonly string[];
  hint?: string;
  run: () => void;
}

export interface RankedCommand {
  command: PaletteCommand;
  /** The alias that matched, when the label did not. */
  via?: string;
}

function score(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return 0;
}

export function rankCommands(
  commands: readonly PaletteCommand[],
  query: string,
  limit = 12,
): RankedCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands.slice(0, limit).map((command) => ({ command }));
  const ranked: Array<RankedCommand & { s: number; i: number }> = [];
  commands.forEach((command, i) => {
    const own = score(command.label, q);
    let best = { s: own, via: undefined as string | undefined };
    for (const a of command.aliases ?? []) {
      const s = score(a, q) - 5;
      if (s > best.s) best = { s, via: a };
    }
    if (best.s > 0) ranked.push({ command, via: best.via, s: best.s, i });
  });
  ranked.sort((a, b) => b.s - a.s || a.i - b.i);
  return ranked.slice(0, limit).map(({ command, via }) => ({ command, via }));
}
