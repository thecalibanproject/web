import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { goldenSetQuery, useDeleteGoldenSet, usePutGoldenSet } from '@/api/queries';
import type { GoldenCase } from '@/api/types';
import { checkKinds, MAX_GOLDEN_CASES, parseGoldenCases } from '@/lib/evals';
import { EMPTY, formatDateTime } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import {
  Badge,
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
import { NodeProblems } from '../nodes/node-problems';

const EXAMPLE: GoldenCase[] = [
  {
    id: 'example',
    input: {},
    checks: [{ type: 'contains', value: ['expected text'] }],
  },
];

const preview = (v: unknown) => {
  const s = JSON.stringify(v) ?? '';
  return s.length > 80 ? `${s.slice(0, 80)}...` : s;
};

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
      title={`Golden set of ${name} v${version}`}
      description={`A JSON array of at most ${MAX_GOLDEN_CASES} cases: id, input, and checks (exact, contains, regex, json_schema, llm_judge) or expected; answers script human steps. Inputs are checked against the version's input schema when you save.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={put.isPending} onClick={save}>
            Save golden set
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Cases" error={error}>
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
        <NodeProblems error={put.error} title="The control plane refused the golden set" />
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
      ? 'Your role cannot see the cases, so it cannot edit them (needs runs.data).'
      : null);

  return (
    <Card className="mb-4">
      <CardHeader
        title={`Golden set of v${version}`}
        description="The cases a golden eval runs, k times each. Cases are tenant content, sealed at rest."
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
                {set ? 'Edit cases' : 'Create golden set'}
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
          title={`v${version} has no golden set`}
          description="Golden sets belong to one version, since inputs follow its input schema. Without one, only the injection suite can run."
        />
      ) : (
        <>
          <p className="border-b border-border px-4 py-2 text-[12px] text-fg-muted">
            {set.case_count} case{set.case_count === 1 ? '' : 's'} ·{' '}
            <code className="font-mono" title={set.hash}>
              {shortHash(set.hash)}
            </code>{' '}
            · updated {formatDateTime(set.updated_at)} by {set.updated_by}
          </p>
          {!set.content_visible ? (
            <p className="p-4 text-[12.5px] text-fg-muted">
              The cases are run content: your role sees how many there are, not what they say (needs
              runs.data).
            </p>
          ) : (
            <Table label="Golden cases">
              <THead>
                <tr>
                  <TH>Case</TH>
                  <TH>Input</TH>
                  <TH>Checks</TH>
                  <TH>Scripted answers</TH>
                  <TH>Tags</TH>
                </tr>
              </THead>
              <TBody>
                {(set.cases ?? []).map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-[12px]">{c.id}</TD>
                    <TD className="max-w-80 truncate font-mono text-[12px] text-fg-muted">
                      {preview(c.input)}
                    </TD>
                    <TD>
                      <span className="inline-flex flex-wrap gap-1">
                        {checkKinds(c).map((k, i) => (
                          <Badge key={i}>{k}</Badge>
                        ))}
                      </span>
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
        title={`Delete the golden set of v${version}?`}
        confirmLabel="Delete golden set"
        loading={del.isPending}
        error={del.error}
        onCancel={() => {
          del.reset();
          setDeleting(false);
        }}
        onConfirm={() => del.mutate(undefined, { onSuccess: () => setDeleting(false) })}
      >
        <p>
          Its cases are deleted. Evals already run keep their metrics, and the promotion gate still
          counts them. New golden evals of v{version} need a new set.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
