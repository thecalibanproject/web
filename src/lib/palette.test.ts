import { describe, expect, it } from 'vitest';
import { rankCommands, type PaletteCommand } from './palette';

const cmd = (id: string, label: string, aliases: string[] = [], boost = 0): PaletteCommand => ({
  id,
  label,
  group: 'Pages',
  aliases,
  boost,
  run: () => {},
});

describe('rankCommands', () => {
  const commands = [
    cmd('a', 'Assistants', ['nodes'], 20),
    cmd('b', 'Data dictionary', ['ontology'], 20),
    cmd('c', 'Query plan', ['CQIR']),
  ];

  it('lists everything in order with no query', () => {
    expect(rankCommands(commands, '').map((r) => r.command.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds a renamed thing by its old name and says which name matched', () => {
    const [first] = rankCommands(commands, 'cqir');
    expect(first?.command.id).toBe('c');
    expect(first?.via).toBe('CQIR');
  });

  it('prefers a label match to an alias match', () => {
    expect(rankCommands(commands, 'data')[0]?.command.id).toBe('b');
    expect(rankCommands(commands, 'data')[0]?.via).toBeUndefined();
  });

  it('matches word starts and drops what does not match', () => {
    expect(rankCommands(commands, 'dictionary').map((r) => r.command.id)).toEqual(['b']);
    expect(rankCommands(commands, 'zzz')).toEqual([]);
  });
});
