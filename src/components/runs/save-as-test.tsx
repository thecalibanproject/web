import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { useCaptureGoldenCase } from '@/api/queries';
import type { RunStatus } from '@/api/types';
import { captureErrorMessage, MAX_NOTE, type Verdict } from '@/lib/capture';
import { doc } from '@/lib/docs';
import { deniedReason } from '@/lib/permissions';
import { isRunActive, MAST_LABEL, type CapturedGoldenCase, type MastLabel } from '@/lib/runs';
import { LearnMore } from '../help/learn-more';
import { ConfirmDialog, Field, GatedButton, Select, Textarea } from '../ui';

/**
 * "Save as test": turns a finished conversation into a test case of its
 * version, as a right answer or a wrong one with what it should have done
 * (research note 10, section 6). The case runs with the version's tests from
 * then on.
 */
export function SaveAsTest({
  tenantId,
  runId,
  node,
  version,
  status,
}: {
  tenantId: string;
  runId: string;
  node: string;
  version: number;
  status: RunStatus;
}) {
  const denied = deniedReason(usePermissions(), 'nodes.write', tenantId);
  const capture = useCaptureGoldenCase(tenantId);
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState('');
  const [label, setLabel] = useState<MastLabel | ''>('');
  const [saved, setSaved] = useState<CapturedGoldenCase | null>(null);
  // Shown after a Save with something missing: the button stays enabled (AGENTS.md, Forms).
  const [tried, setTried] = useState(false);
  const name = useId();

  const notFinished = isRunActive(status);
  const notGood = status !== 'succeeded';
  const blocked = notFinished ? 'The conversation has not finished yet.' : null;
  const ready = verdict === 'good' || (verdict === 'bad' && note.trim().length > 0);

  const save = () => {
    if (!verdict || !ready) {
      setTried(true);
      return;
    }
    capture.mutate(
      {
        runId,
        body:
          verdict === 'good'
            ? { verdict, ...(note.trim() ? { note: note.trim() } : {}), version }
            : { verdict, note: note.trim(), ...(label ? { mast_label: label } : {}), version },
      },
      {
        onSuccess: (c) => {
          setSaved(c);
          setOpen(false);
        },
      },
    );
  };

  return (
    <>
      <GatedButton
        size="sm"
        deniedReason={denied ?? blocked}
        onClick={() => {
          capture.reset();
          setVerdict(notGood ? 'bad' : null);
          setNote('');
          setLabel('');
          setTried(false);
          setOpen(true);
        }}
      >
        Save as test
      </GatedButton>
      {saved && (
        <p role="status" className="text-[12.5px] text-ok">
          Saved as a test case of version {saved.version}.{' '}
          <Link
            to="/nodes/$tenantId/$nodeName"
            params={{ tenantId, nodeName: saved.node }}
            search={{ tab: 'evals', ev: saved.version }}
            className="text-accent hover:underline"
          >
            Open the tests of {saved.node}
          </Link>
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Save this conversation as a test"
        confirmLabel="Save test case"
        confirmVariant="primary"
        loading={capture.isPending}
        error={
          capture.error ? new Error(captureErrorMessage(capture.error, verdict ?? 'bad')) : null
        }
        onCancel={() => setOpen(false)}
        onConfirm={save}
      >
        <p>
          It becomes a test case of {node}, version {version}, and runs with its tests before the
          next version goes live.{' '}
          <LearnMore doc={doc('guides/tests-and-go-live', 'save-a-run-as-a-test')} />
        </p>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[12.5px] font-medium">Was the answer right?</legend>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={name}
              checked={verdict === 'good'}
              disabled={notGood}
              onChange={() => setVerdict('good')}
              className="accent-accent"
            />
            This answer was right
          </label>
          {notGood && (
            <p className="pl-5.5 text-[12px] text-fg-muted">
              Only a conversation that succeeded can be saved as a right answer.
            </p>
          )}
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={name}
              checked={verdict === 'bad'}
              onChange={() => setVerdict('bad')}
              className="accent-accent"
            />
            This answer was wrong
          </label>
          {tried && !verdict && (
            <p role="alert" className="text-[12px] text-danger">
              Choose whether the answer was right or wrong.
            </p>
          )}
        </fieldset>
        {verdict === 'bad' && (
          <>
            <Field
              label="What should it have done?"
              required
              hint="A grader model checks future answers against this."
              error={
                tried && !note.trim() ? 'Say what it should have done: the grader needs it.' : null
              }
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  dir="auto"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={note}
                  maxLength={MAX_NOTE}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </Field>
            <Field label="What went wrong (optional)">
              {({ id }) => (
                <Select
                  id={id}
                  value={label}
                  onChange={(e) => setLabel(e.target.value as MastLabel | '')}
                >
                  <option value="">Not sure</option>
                  {(Object.entries(MAST_LABEL) as Array<[MastLabel, string]>).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        {verdict === 'good' && (
          <Field label="Anything a good answer must keep (optional)">
            {({ id }) => (
              <Textarea
                id={id}
                dir="auto"
                value={note}
                maxLength={MAX_NOTE}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
