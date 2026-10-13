import { useId, useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAnswerRun } from '@/api/queries';
import type { Approval, ConsoleRun } from '@/api/types';
import {
  actionName,
  argRows,
  parseToolRef,
  provenance,
  provenanceText,
  REJECT_REASONS,
  whyApproval,
  type ArgRow,
} from '@/lib/approvalArgs';
import { cn } from '@/lib/cn';
import { deniedReason } from '@/lib/permissions';
import { Checkbox, ConfirmDialog, Field, FormError, GatedButton, Input, Textarea } from '../ui';
import { TaintLabels } from './run-badges';

const HIDDEN =
  'The content of this conversation is hidden: your role can see that it waits, not what it says (needs runs.data).';

/** A 409: the run no longer waits for this step (answered elsewhere, timed out or cancelled). */
function AnswerError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 409) {
    return (
      <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
        This conversation no longer waits for this step: someone else may have answered it, or it
        timed out or was cancelled. The list has been refreshed.
      </p>
    );
  }
  return <FormError error={error} />;
}

const TONE: Record<string, string> = {
  'on-file': 'text-ok',
  'customer-only': 'text-warn font-medium',
  'not-found': 'text-fg-muted',
};

function ArgList({
  rows,
  run,
  label,
}: {
  rows: ArgRow[];
  run?: Pick<ConsoleRun, 'input' | 'steps'> | null;
  label: string;
}) {
  if (rows.length === 0) return <p className="text-[12.5px] text-fg-muted">No details.</p>;
  return (
    // One grid for the whole list, so every value starts in the same column
    // however long its key; on a phone each key sits above its value.
    <dl
      aria-label={label}
      className="grid grid-cols-1 gap-y-1 text-[12.5px] sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4"
    >
      {rows.map((r, i) => {
        const p = run && r.value !== null ? provenance(r.value, run) : null;
        const note = p ? provenanceText(p) : null;
        return (
          <div key={i} className="contents">
            <dt className="break-words text-fg-muted" style={{ paddingLeft: `${r.depth}rem` }}>
              {r.key}
            </dt>
            <dd className="min-w-0 break-words">
              {r.value !== null && <span dir="auto">{r.value}</span>}
              {note && p && <span className={cn('block text-[12px]', TONE[p.kind])}>{note}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** The customer's message (the run input), as text in its own direction. */
export function CustomerMessage({ input }: { input: unknown }) {
  if (input === undefined || input === null) return null;
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <h3 className="mb-1 text-[12px] font-medium text-fg-muted">What the customer wrote</h3>
      {typeof input === 'string' ? (
        <p dir="auto" className="text-[13px] break-words whitespace-pre-wrap">
          {input}
        </p>
      ) : (
        <ArgList rows={argRows(input)} label="What the customer wrote" />
      )}
    </div>
  );
}

/**
 * A call waiting for approval, in plain words: the action and its system, why
 * it needs a person, and (with runs.data) its details as a list, each checked
 * against the conversation when `run` is given. Without the structured
 * approval (a run from a worker that recorded none) the question is shown.
 */
export function ApprovalDetails({
  approval,
  question,
  contentVisible,
  run,
}: {
  approval: Approval | null | undefined;
  question: string | null | undefined;
  contentVisible: boolean;
  run?: Pick<ConsoleRun, 'input' | 'steps'> | null;
}) {
  if (!approval) {
    if (!contentVisible) return <p className="text-[12.5px] text-fg-muted">{HIDDEN}</p>;
    return question ? (
      <p dir="auto" className="text-[13px] break-words whitespace-pre-wrap">
        {question}
      </p>
    ) : (
      <p className="text-[12.5px] text-fg-muted">The assistant did not say what it would do.</p>
    );
  }
  const t = parseToolRef(approval.tool);
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      <p className="text-[13px]">
        <span className="font-medium">{t.tool}</span>
        {t.system && <span className="text-fg-muted"> on {t.system}</span>}
        {approval.tool && (
          <code className="ml-2 font-mono text-[11.5px] text-fg-subtle" title={approval.tool}>
            {approval.tool}
          </code>
        )}
      </p>
      <p>
        <span className="text-fg-muted">Why it needs you: </span>
        {whyApproval(approval.effect, approval.labels ?? [])}
      </p>
      {(approval.labels ?? []).length > 0 && (
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-fg-muted">Data from</span>
          <TaintLabels labels={approval.labels ?? []} />
        </p>
      )}
      <div>
        <h3 className="mb-1 text-[12px] font-medium text-fg-muted">What it would send</h3>
        {contentVisible ? (
          <ArgList rows={argRows(approval.arguments ?? null)} run={run} label="Arguments" />
        ) : (
          <p className="text-fg-muted">
            Hidden: the details are conversation content (needs runs.data).
          </p>
        )}
      </div>
    </div>
  );
}

/** Reject with a reason: the reason goes back with the answer and stays with the conversation. */
function RejectDialog({
  open,
  what,
  loading,
  error,
  onCancel,
  onReject,
}: {
  open: boolean;
  what: string;
  loading: boolean;
  error: unknown;
  onCancel: () => void;
  onReject: (reason: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const [text, setText] = useState('');
  const name = useId();
  const needsText = choice === 'Other';
  const ready = Boolean(choice) && (!needsText || text.trim().length > 0);
  const reason = needsText ? text.trim() : text.trim() ? `${choice}: ${text.trim()}` : choice;
  return (
    <ConfirmDialog
      open={open}
      title={`Reject ${what}?`}
      confirmLabel="Reject"
      confirmDisabled={!ready}
      loading={loading}
      error={error}
      onCancel={onCancel}
      onConfirm={() => {
        if (ready) onReject(reason);
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[12.5px] font-medium">Why are you rejecting it?</legend>
        {REJECT_REASONS.map((r) => (
          <label key={r} className="inline-flex items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={name}
              value={r}
              checked={choice === r}
              onChange={() => setChoice(r)}
              className="accent-accent"
            />
            {r}
          </label>
        ))}
      </fieldset>
      <Field label={needsText ? 'Your reason' : 'Anything to add (optional)'} required={needsText}>
        {({ id }) => (
          <Input
            id={id}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
        )}
      </Field>
      <p className="text-[12.5px] text-fg-muted">
        The action is not taken. Your reason goes back to the assistant and is kept with the
        conversation; the audit log records the rejection under your name.
      </p>
    </ConfirmDialog>
  );
}

export type HumanIntent = 'approve' | 'reject' | null;
export type HumanDecision = 'approved' | 'rejected' | 'answered';

/**
 * Answers the human step a run waits for, as the signed-in user: approve or
 * reject (with a reason) an action, or answer a question. `onAnswered` gets a
 * sentence for the page's status line. `intent` lets a page open the approve
 * or reject dialog from the keyboard.
 */
export function HumanStepActions({
  tenantId,
  runId,
  step,
  kind,
  approval,
  question,
  contentVisible,
  run,
  intent: controlled,
  onIntentChange,
  onAnswered,
}: {
  tenantId: string;
  runId: string;
  step: string;
  kind: 'question' | 'approval';
  approval?: Approval | null;
  question: string | null | undefined;
  contentVisible: boolean;
  run?: Pick<ConsoleRun, 'input' | 'steps'> | null;
  intent?: HumanIntent;
  onIntentChange?: (intent: HumanIntent) => void;
  onAnswered?: (message: string, decision: HumanDecision) => void;
}) {
  const answer = useAnswerRun(tenantId);
  const denied = deniedReason(usePermissions(), 'runs.answer', tenantId);
  const [own, setOwn] = useState<HumanIntent>(null);
  const intent = controlled !== undefined ? controlled : own;
  const setIntent = (i: HumanIntent) => {
    if (controlled === undefined) setOwn(i);
    onIntentChange?.(i);
  };
  const [text, setText] = useState('');
  const [asJson, setAsJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const what = actionName(approval);

  const send = (value: unknown, done: string, decision: HumanDecision) =>
    answer.mutate(
      { runId, step, answer: value },
      {
        onSuccess: () => {
          setIntent(null);
          setText('');
          onAnswered?.(done, decision);
        },
        // The step is gone (answered elsewhere, timed out): close the dialog and say so.
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) setIntent(null);
        },
      },
    );

  if (kind === 'approval') {
    const open = (i: HumanIntent) => {
      answer.reset();
      setIntent(i);
    };
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <GatedButton
            size="sm"
            variant="primary"
            deniedReason={denied}
            disabled={answer.isPending}
            aria-label={`Approve ${what} for conversation ${runId}`}
            aria-keyshortcuts="A"
            onClick={() => open('approve')}
          >
            Approve
          </GatedButton>
          <GatedButton
            size="sm"
            variant="danger"
            deniedReason={denied}
            disabled={answer.isPending}
            aria-label={`Reject ${what} for conversation ${runId}`}
            aria-keyshortcuts="R"
            onClick={() => open('reject')}
          >
            Reject
          </GatedButton>
        </div>
        {!intent && <AnswerError error={answer.error} />}
        <ConfirmDialog
          open={intent === 'approve' && !denied}
          title={`Approve ${what}?`}
          confirmLabel="Approve"
          confirmVariant="primary"
          loading={answer.isPending}
          error={answer.error}
          onCancel={() => setIntent(null)}
          onConfirm={() =>
            send({ approve: true }, `Approved ${what} for conversation ${runId}.`, 'approved')
          }
        >
          <p>
            It runs once, with the details below. The approval covers this step only, and the audit
            log records it under your name.
          </p>
          <ApprovalDetails
            approval={approval}
            question={question}
            contentVisible={contentVisible}
            run={run}
          />
        </ConfirmDialog>
        {intent === 'reject' && !denied && (
          <RejectDialog
            open
            what={what}
            loading={answer.isPending}
            error={answer.error}
            onCancel={() => setIntent(null)}
            onReject={(reason) =>
              send(
                { approve: false, reason },
                `Rejected ${what} for conversation ${runId}.`,
                'rejected',
              )
            }
          />
        )}
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
    send(value, `Answered conversation ${runId}.`, 'answered');
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2"
      aria-label={`Answer conversation ${runId}`}
    >
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
            dir="auto"
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
