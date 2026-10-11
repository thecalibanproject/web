import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAnswerRun } from '@/api/queries';
import { deniedReason } from '@/lib/permissions';
import { parseApproval, prettyJson } from '@/lib/runs';
import { Checkbox, CodeBlock, ConfirmDialog, Field, FormError, GatedButton, Textarea } from '../ui';
import { TaintLabels } from './run-badges';

const HIDDEN =
  'Run content is hidden: your role can see that a run waits, not what it asks (needs runs.data).';

/** A 409: the run no longer waits for this step (answered elsewhere, timed out or cancelled). */
function AnswerError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 409) {
    return (
      <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
        This run no longer waits for this step: someone else may have answered it, or it timed out
        or was cancelled. The list has been refreshed.
      </p>
    );
  }
  return <FormError error={error} />;
}

/** The tool, the untrusted taint labels and the arguments of a write waiting for approval. */
export function ApprovalDetails({
  question,
  contentVisible,
}: {
  question: string | null | undefined;
  contentVisible: boolean;
}) {
  if (!contentVisible) return <p className="text-[12.5px] text-fg-muted">{HIDDEN}</p>;
  const approval = parseApproval(question);
  if (!approval) {
    return question ? (
      <p className="text-[13px] break-words whitespace-pre-wrap">{question}</p>
    ) : (
      <p className="text-[12.5px] text-fg-muted">The run did not say what it would write.</p>
    );
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[12.5px]">
      <dt className="text-fg-muted">Tool</dt>
      <dd className="min-w-0">
        <code className="font-mono text-[12px] break-all">{approval.tool}</code>{' '}
        <span className="text-fg-subtle">(effect: write)</span>
      </dd>
      <dt className="text-fg-muted">Untrusted data</dt>
      <dd className="min-w-0">
        <TaintLabels labels={approval.labels} />
      </dd>
      <dt className="text-fg-muted">Arguments</dt>
      <dd className="min-w-0">
        <CodeBlock
          label="Arguments"
          language={approval.truncated ? undefined : 'json'}
          code={prettyJson(approval.args)}
          className="max-h-72"
        />
        {approval.truncated && (
          <p className="mt-1 text-[12px] text-fg-subtle">Cut at 2000 characters by the executor.</p>
        )}
      </dd>
    </dl>
  );
}

/**
 * Answers the human step a run waits for, as the signed-in user: approve or
 * deny a tainted write, or answer a question. `onAnswered` gets a sentence
 * for the page's status line.
 */
export function HumanStepActions({
  tenantId,
  runId,
  step,
  kind,
  question,
  contentVisible,
  onAnswered,
}: {
  tenantId: string;
  runId: string;
  step: string;
  kind: 'question' | 'approval';
  question: string | null | undefined;
  contentVisible: boolean;
  onAnswered?: (message: string) => void;
}) {
  const answer = useAnswerRun(tenantId);
  const denied = deniedReason(usePermissions(), 'runs.answer', tenantId);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  const [asJson, setAsJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const send = (value: unknown, done: string) =>
    answer.mutate(
      { runId, step, answer: value },
      {
        onSuccess: () => {
          setConfirming(false);
          setText('');
          onAnswered?.(done);
        },
        onError: () => setConfirming(false),
      },
    );

  if (kind === 'approval') {
    const approval = parseApproval(question);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <GatedButton
            size="sm"
            variant="primary"
            deniedReason={denied}
            disabled={answer.isPending}
            aria-label={`Approve the write of run ${runId}`}
            onClick={() => {
              answer.reset();
              setConfirming(true);
            }}
          >
            Approve
          </GatedButton>
          <GatedButton
            size="sm"
            variant="danger"
            deniedReason={denied}
            loading={answer.isPending && !confirming}
            aria-label={`Deny the write of run ${runId}`}
            onClick={() => send({ approve: false }, `Denied the write of run ${runId}.`)}
          >
            Deny
          </GatedButton>
        </div>
        <AnswerError error={answer.error} />
        <ConfirmDialog
          open={confirming}
          title="Approve this write?"
          confirmLabel="Approve write"
          confirmVariant="primary"
          loading={answer.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => send({ approve: true }, `Approved the write of run ${runId}.`)}
        >
          <p>
            {approval ? (
              <>
                <code className="font-mono font-medium break-all">{approval.tool}</code> is called
                once
              </>
            ) : (
              'The tool is called once'
            )}{' '}
            with arguments derived from untrusted data. The approval covers this step only, and is
            recorded under your name in the audit log.
          </p>
          <ApprovalDetails question={question} contentVisible={contentVisible} />
        </ConfirmDialog>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let value: unknown = text;
    if (asJson) {
      try {
        value = JSON.parse(text) as unknown;
      } catch (err) {
        setJsonError(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    send(value, `Answered run ${runId}.`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label={`Answer run ${runId}`}>
      <Field
        label="Your answer"
        hint={
          asJson ? 'Sent as a JSON value.' : 'Sent as text. Your name is recorded with the answer.'
        }
        error={jsonError}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={text}
            disabled={Boolean(denied)}
            onChange={(e) => {
              setText(e.target.value);
              setJsonError(null);
            }}
            className={asJson ? 'font-mono text-[12px]' : undefined}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          label="Answer is JSON"
          checked={asJson}
          disabled={Boolean(denied)}
          onChange={(e) => {
            setAsJson(e.target.checked);
            setJsonError(null);
          }}
        />
        <GatedButton
          size="sm"
          type="submit"
          variant="primary"
          deniedReason={denied}
          loading={answer.isPending}
          disabled={!text.trim()}
        >
          Send answer
        </GatedButton>
      </div>
      {!contentVisible && <p className="text-[12px] text-fg-muted">{HIDDEN}</p>}
      <AnswerError error={answer.error} />
    </form>
  );
}
