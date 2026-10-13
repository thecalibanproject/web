import { specBehavior, type AnswerGuardMode, type Reasoning } from '@/lib/nodeBehavior';
import { EMPTY } from '@/lib/format';
import { Badge, Table, TBody, TD, TH, THead, TR, type Tone } from '../ui';

const GUARD_TONE: Record<AnswerGuardMode, Tone> = { redact: 'ok', refuse: 'info', off: 'danger' };

const GUARD_LABEL: Record<AnswerGuardMode, string> = {
  redact: 'Remove suspicious parts',
  refuse: 'Refuse to answer',
  off: 'Off',
};

const GUARD_HINT: Record<AnswerGuardMode, string> = {
  redact:
    'Links, contacts and references that only outside text supplied, and echoes of hidden instructions, are removed from the answer.',
  refuse: 'When the answer carries what only outside text supplied, the assistant does not answer.',
  off: 'The answer is not checked: what the assistant reads can steer what it tells people.',
};

const PII_LABEL: Record<string, string> = {
  reversible: 'Hide from the model, restore in the answer',
  mask: 'Hide everywhere',
  off: 'Do not hide',
};

/**
 * What the PII mode does to tool results (docs/tools.md, Personal data): in
 * reversible mode they enter the run as they are (models get surrogates, the
 * caller the real values); mask is irreversible, so the caller sees masks too.
 */
const PII_FLOOR_HINT: Record<string, string> = {
  reversible:
    'What tools return comes in as it is: models see placeholders, and the person asking gets the real values.',
  mask: 'Hidden for good: what tools return is hidden as it comes in, so the person asking sees [PHONE] too. An assistant that must quote contacts from your data should restore them in the answer instead.',
  off: "Adds nothing: this setting can only make the workspace's protection stronger.",
};

const NO_FLOOR_HINT =
  "The workspace's setting applies. When it restores data in the answer, people get the real values; when it hides everywhere, they see [PHONE] too.";

function reasoningText(own: Reasoning | undefined, node: Reasoning | undefined): string {
  if (own) return own;
  return node ? `${node} (assistant default)` : "model's default";
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
        <dt className="text-fg-muted">Answer check</dt>
        <dd className="flex min-w-0 flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={GUARD_TONE[b.answerGuard]} title={`guardrails.answer: ${b.answerGuard}`}>
              {GUARD_LABEL[b.answerGuard]}
            </Badge>
            {!b.answerGuardSet && <span className="text-fg-subtle">(default)</span>}
          </span>
          <span className="text-[12px] text-fg-subtle">{GUARD_HINT[b.answerGuard]}</span>
        </dd>
        <dt className="text-fg-muted">Personal data, at least</dt>
        <dd className="flex min-w-0 flex-col gap-0.5">
          {b.piiFloor ? (
            <span title={`guardrails.pii: ${b.piiFloor}`}>
              {PII_LABEL[b.piiFloor] ?? b.piiFloor}
              <span className="text-fg-subtle">
                {' '}
                on every model call, models on your own servers included
              </span>
            </span>
          ) : (
            <span className="text-fg-subtle">Not set: the workspace&apos;s setting applies</span>
          )}
          <span className="text-[12px] text-fg-subtle">
            {b.piiFloor ? (PII_FLOOR_HINT[b.piiFloor] ?? '') : NO_FLOOR_HINT}
          </span>
        </dd>
        <dt className="text-fg-muted">Thinking</dt>
        <dd>{reasoningText(b.reasoning, undefined)}</dd>
      </dl>
      {b.vertices.length > 0 && (
        <Table label="Model steps">
          <THead>
            <tr>
              <TH>Step</TH>
              <TH>Kind</TH>
              <TH>Thinking</TH>
              <TH>Answer in a fixed format</TH>
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
                    ? 'Enforced by the model server'
                    : v.structuredOutput === 'prompt'
                      ? 'Asked in the instructions'
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
