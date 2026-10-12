import { describe, expect, it } from 'vitest';
import { specBehavior } from './nodeBehavior';

describe('specBehavior', () => {
  it('reads the answer guard, the PII floor and each model vertex', () => {
    const b = specBehavior({
      kind: 'workflow',
      model_policy: { reasoning: 'low' },
      guardrails: { answer: 'refuse', pii: 'mask' },
      graph: {
        vertices: [
          { id: 'classify', type: 'router', config: { reasoning: 'off' } },
          { id: 'search', type: 'tool', config: { tool: 'mcp://catalogue/search' } },
          {
            id: 'draft',
            type: 'llm',
            config: { output_schema: { type: 'object' }, structured_output: 'prompt' },
          },
          { id: 'chat', type: 'llm' },
          { id: 'join', type: 'reduce', config: { mode: 'concat' } },
          { id: 'sum', type: 'reduce', config: { mode: 'llm', reasoning: 'high' } },
          {
            id: 'each',
            type: 'map',
            config: { body: { type: 'verify', config: { output_schema: {} } } },
          },
        ],
      },
    });
    expect(b).toEqual({
      answerGuard: 'refuse',
      answerGuardSet: true,
      piiFloor: 'mask',
      reasoning: 'low',
      vertices: [
        { id: 'classify', type: 'router', reasoning: 'off', structuredOutput: 'json_schema' },
        { id: 'draft', type: 'llm', reasoning: undefined, structuredOutput: 'prompt' },
        { id: 'chat', type: 'llm', reasoning: undefined, structuredOutput: undefined },
        { id: 'sum', type: 'reduce (llm)', reasoning: 'high', structuredOutput: undefined },
        { id: 'each/body', type: 'verify', reasoning: undefined, structuredOutput: 'json_schema' },
      ],
    });
  });

  it('applies the defaults to an agent or a spec that sets nothing', () => {
    expect(specBehavior({ kind: 'agent' })).toEqual({
      answerGuard: 'redact',
      answerGuardSet: false,
      piiFloor: undefined,
      reasoning: undefined,
      vertices: [],
    });
    expect(specBehavior(null).answerGuard).toBe('redact');
    expect(specBehavior({ guardrails: { answer: 'loud' } }).answerGuardSet).toBe(false);
  });
});
