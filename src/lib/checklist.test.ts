import { describe, expect, it } from 'vitest';
import { currentPhase, phaseDone, setupPhases } from './checklist';

describe('setupPhases', () => {
  it('derives each item from the facts and leaves unknown ones out', () => {
    const phases = setupPhases(
      { serverReachable: true, chatModel: false, workspace: true, assistant: false },
      't1',
    );
    expect(phases.map((p) => p.id)).toEqual(['install', 'assistant']);
    expect(phases[0]!.items.map((i) => [i.id, i.done])).toEqual([
      ['serverReachable', true],
      ['chatModel', false],
      ['workspace', true],
    ]);
    expect(currentPhase(phases)?.id).toBe('install');
  });

  it('moves on to the first assistant once installing is done', () => {
    const phases = setupPhases(
      {
        serverReachable: true,
        chatModel: true,
        workspace: true,
        appKey: true,
        firstRequest: true,
        data: true,
        assistant: true,
        published: false,
        live: false,
      },
      't1',
    );
    expect(phaseDone(phases[0]!)).toBe(true);
    expect(currentPhase(phases)?.id).toBe('assistant');
    const key = phases[0]!.items.find((i) => i.id === 'appKey')!;
    expect(key.link).toEqual({
      to: '/tenants/$tenantId',
      params: { tenantId: 't1' },
      search: { tab: 'api-keys' },
    });
  });

  it('drops a phase with nothing known', () => {
    expect(setupPhases({ assistant: true }, 't1').map((p) => p.id)).toEqual(['assistant']);
    expect(currentPhase(setupPhases({ assistant: true }, 't1'))).toBeUndefined();
  });
});
