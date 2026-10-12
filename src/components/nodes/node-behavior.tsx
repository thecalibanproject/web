import { specBehavior, type AnswerGuardMode, type Reasoning } from '@/lib/nodeBehavior';
import { EMPTY } from '@/lib/format';
import { Badge, Table, TBody, TD, TH, THead, TR, type Tone } from '../ui';

const GUARD_TONE: Record<AnswerGuardMode, Tone> = { redact: 'ok', refuse: 'info', off: 'danger' };

const GUARD_HINT: Record<AnswerGuardMode, string> = {
  redact:
    'When the answer carries untrusted data, links, contacts and references that only untrusted text supplied, and echoes of injected instructions, are removed and the run succeeds.',
  refuse:
    'When the answer carries what only untrusted text supplied, the run fails instead of answering.',
  off: 'The answer is not checked: what the node reads can steer what it tells the user.',
};

/**
 * What the PII mode does to tool results (docs/tools.md, Personal data): in
 * reversible mode they enter the run as they are (models get surrogates, the
 * caller the real values); mask is irreversible, so the caller sees masks too.
 */
const PII_FLOOR_HINT: Record<string, string> = {
  reversible:
    'Tool results enter the run as they are: models get surrogates, and the caller gets the real values.',
  mask: 'Irreversible: tool results are masked as they enter the run, so the caller sees [PHONE] too. A node that must quote contacts from a catalogue should use reversible.',
  off: "Adds nothing: the floor only strengthens the tenant's mode.",
};

const NO_FLOOR_HINT =
  'In reversible mode tool results enter the run as they are and the caller gets the real values; mask is irreversible, so the caller sees [PHONE] too.';

function reasoningText(own: Reasoning | undefined, node: Reasoning | undefined): string {
  if (own) return own;
  return node ? `${node} (node default)` : "model's default";
}

/**
 * How a version answers and calls its models: the answer guard
 * (`guardrails.answer`), the PII floor (`guardrails.pii`), and per model
 * vertex the reasoning effort and how its schema or labels are enforced.
 */
export function NodeBehavior({ spec }: { spec: unknown }) {
  const b = specBehavior(spec);
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-fg-muted">Answer guard</dt>
        <dd className="flex min-w-0 flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={GUARD_TONE[b.answerGuard]}>{b.answerGuard}</Badge>
            {!b.answerGuardSet && <span className="text-fg-subtle">(default)</span>}
          </span>
          <span className="text-[12px] text-fg-subtle">{GUARD_HINT[b.answerGuard]}</span>
        </dd>
        <dt className="text-fg-muted">PII floor</dt>
        <dd className="flex min-w-0 flex-col gap-0.5">
          {b.piiFloor ? (
            <span>
              <code className="font-mono">{b.piiFloor}</code>
              <span className="text-fg-subtle">
                {' '}
                on every model call, sovereign models included
              </span>
            </span>
          ) : (
            <span className="text-fg-subtle">None: the tenant&apos;s PII settings apply</span>
          )}
          <span className="text-[12px] text-fg-subtle">
            {b.piiFloor ? (PII_FLOOR_HINT[b.piiFloor] ?? '') : NO_FLOOR_HINT}
          </span>
        </dd>
        <dt className="text-fg-muted">Reasoning</dt>
        <dd>{reasoningText(b.reasoning, undefined)}</dd>
      </dl>
      {b.vertices.length > 0 && (
        <Table label="Model vertices">
          <THead>
            <tr>
              <TH>Vertex</TH>
              <TH>Type</TH>
              <TH>Reasoning</TH>
              <TH>Structured output</TH>
            </tr>
          </THead>
          <TBody>
            {b.vertices.map((v) => (
              <TR key={v.id}>
                <TD className="font-mono text-[12px]">{v.id}</TD>
                <TD>
                  <Badge>{v.type}</Badge>
                </TD>
                <TD>{reasoningText(v.reasoning, b.reasoning)}</TD>
                <TD
                  title={
                    v.structuredOutput === 'json_schema'
                      ? 'The server is asked for constrained decoding (response_format json_schema); the answer is validated too.'
                      : v.structuredOutput === 'prompt'
                        ? 'The schema is in the prompt only, for servers without guided decoding; the answer is validated.'
                        : undefined
                  }
                >
                  {v.structuredOutput === 'json_schema'
                    ? 'Constrained decoding'
                    : v.structuredOutput === 'prompt'
                      ? 'In the prompt'
                      : EMPTY}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
