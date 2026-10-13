import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { goldenSetQuery, useDeleteGoldenSet, usePutGoldenSet } from '@/api/queries';
import type { GoldenCase } from '@/api/types';
import { doc } from '@/lib/docs';
import { describeCheck, MAX_GOLDEN_CASES, parseGoldenCases } from '@/lib/evals';
import { EMPTY, formatDateTime } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  GatedButton,
  LoadingState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '../ui';
import { LearnMore } from '../help/learn-more';
import { NodeProblems } from '../nodes/node-problems';

const EXAMPLE: GoldenCase[] = [
  {
    id: 'example',
    input: {},
    checks: [{ type: 'contains', value: ['expected text'] }],
  },
];

/** A test case's input for people: its text when it has one, else compact JSON. */
const preview = (v: unknown) => {
  const text =
    typeof v === 'string'
      ? v
      : v &&
          typeof v === 'object' &&
          Object.values(v).length === 1 &&
          typeof Object.values(v)[0] === 'string'
        ? (Object.values(v)[0] as string)
        : (JSON.stringify(v) ?? '');
  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
};

/** A case's checks, plus the `expected` shorthand, in plain words. */
function caseChecks(c: GoldenCase): string[] {
  const out = (c.checks ?? []).map(describeCheck);
  if (c.expected !== undefined) out.unshift(describeCheck({ type: 'exact', value: c.expected }));
  return out;
}

function GoldenEditor({
  tenantId,
  name,
  version,
  cases,
  onClose,
}: {
  tenantId: string;
  name: string;
  version: number;
  cases: GoldenCase[];
  onClose: () => void;
}) {
  const put = usePutGoldenSet(tenantId, name, version);
  const [text, setText] = useState(() => JSON.stringify(cases, null, 2));
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const parsed = parseGoldenCases(text);
    if (parsed.error !== null) {
      setError(parsed.error);
      return;
    }
    put.mutate(parsed.cases, { onSuccess: onClose });
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Test cases of ${name} v${version}`}
      description={
        <>
          At most {MAX_GOLDEN_CASES} test cases, as JSON. Each has a name (id), the request (input)
          and what a good answer looks like (checks). Inputs are checked against the version when
          you save. <LearnMore doc={doc('guides/tests-and-go-live', 'test-cases')} />
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={put.isPending} onClick={save}>
            Save test cases
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Test cases (JSON)" error={error}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
                put.reset();
              }}
              className="min-h-96 font-mono text-[12px]"
            />
          )}
        </Field>
        <NodeProblems error={put.error} title="Caliban could not save these test cases" />
      </div>
    </Drawer>
  );
}

/** A version's golden set: its cases (with runs.data), editing and deletion. */
export function GoldenSetCard({
  tenantId,
  name,
  version,
}: {
  tenantId: string;
  name: string;
  version: number;
}) {
  const q = useQuery(goldenSetQuery(tenantId, name, version));
  const del = useDeleteGoldenSet(tenantId, name, version);
  const perms = usePermissions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = q.data;
  const cannotWrite = deniedReason(perms, 'nodes.write', tenantId);
  const cannotEdit =
    cannotWrite ??
    (set && !set.content_visible
      ? 'Your role cannot see the test cases, so it cannot edit them (needs runs.data).'
      : null);

  return (
    <Card className="mb-4">
      <CardHeader
        title={`Test cases of v${version}`}
        description="What the quality tests run, a few tries each. Kept encrypted, like conversations."
        actions={
          q.isSuccess && (
            <>
              {set && (
                <GatedButton
                  size="sm"
                  variant="danger"
                  deniedReason={cannotWrite}
                  onClick={() => setDeleting(true)}
                >
                  Delete
                </GatedButton>
              )}
              <GatedButton
                size="sm"
                variant={set ? 'secondary' : 'primary'}
                deniedReason={cannotEdit}
                onClick={() => setEditing(true)}
              >
                {set ? 'Edit test cases' : 'Add test cases'}
              </GatedButton>
            </>
          )
        }
      />
      {q.isPending ? (
        <LoadingState rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !set ? (
        <EmptyState
          title={`v${version} has no test cases yet`}
          description="Add a few example requests with what a good answer looks like, or save real conversations as tests from their page."
          learnMore={doc('guides/tests-and-go-live', 'save-a-run-as-a-test')}
        />
      ) : (
        <>
          <p className="border-b border-border px-4 py-2 text-[12px] text-fg-muted">
            {set.case_count} test case{set.case_count === 1 ? '' : 's'} ·{' '}
            <code className="font-mono" title={`Fingerprint ${set.hash}`}>
              {shortHash(set.hash)}
            </code>{' '}
            · updated {formatDateTime(set.updated_at)} by {set.updated_by}
          </p>
          {!set.content_visible ? (
            <p className="p-4 text-[12.5px] text-fg-muted">
              Test cases are conversation content: your role sees how many there are, not what they
              say (needs runs.data).
            </p>
          ) : (
            <Table label="Test cases">
              <THead>
                <tr>
                  <TH>Test case</TH>
                  <TH>Request</TH>
                  <TH>A good answer</TH>
                  <TH>Pre-filled replies</TH>
                  <TH>Labels</TH>
                </tr>
              </THead>
              <TBody>
                {(set.cases ?? []).map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-[12px]">{c.id}</TD>
                    <TD className="max-w-80 truncate text-[12.5px] text-fg-muted" dir="auto">
                      {preview(c.input)}
                    </TD>
                    <TD className="max-w-96">
                      <ul className="flex flex-col gap-0.5 text-[12.5px]">
                        {caseChecks(c).map((k, i) => (
                          <li key={i} className="break-words" dir="auto">
                            {k}
                          </li>
                        ))}
                      </ul>
                    </TD>
                    <TD className="font-mono text-[12px] text-fg-muted">
                      {Object.keys(c.answers ?? {}).join(', ') || EMPTY}
                    </TD>
                    <TD className="text-fg-muted">{(c.tags ?? []).join(', ') || EMPTY}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
      {editing && (
        <GoldenEditor
          tenantId={tenantId}
          name={name}
          version={version}
          cases={set?.cases ?? EXAMPLE}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        open={deleting}
        title={`Delete the test cases of v${version}?`}
        confirmLabel="Delete test cases"
        loading={del.isPending}
        error={del.error}
        onCancel={() => {
          del.reset();
          setDeleting(false);
        }}
        onConfirm={() => del.mutate(undefined, { onSuccess: () => setDeleting(false) })}
      >
        <p>
          Every test case of v{version} is deleted. Test runs already finished keep their results,
          and the go-live check still counts them. New quality tests of v{version} need new test
          cases.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
