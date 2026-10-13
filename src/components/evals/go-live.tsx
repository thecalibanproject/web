import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { evalPolicyQuery, evalsQuery, gateQuery } from '@/api/queries';
import type { EvalSuite, Node } from '@/api/types';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { NO_RUN } from '@/lib/evals';
import { goLiveSteps, goLiveTarget, neededSuites, type GoLiveStep } from '@/lib/goLive';
import { deniedReason } from '@/lib/permissions';
import { LearnMore } from '../help/learn-more';
import { VersionDialog, type VersionAction } from '../nodes/version-dialogs';
import { Button, Card, CardHeader, GatedButton } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';
import { Spinner } from '../ui/spinner';
import { StartEvalDrawer } from './start-eval';

const STATUS_TEXT: Record<GoLiveStep['status'], string> = {
  done: 'done',
  current: 'to do now',
  running: 'in progress',
  blocked: 'blocked',
  todo: 'not yet',
};

function Marker({ step, n }: { step: GoLiveStep; n: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-sm border text-[12px] font-semibold transition-colors duration-(--duration-moderate) ease-(--ease-standard)',
        step.status === 'done' && 'border-ok bg-ok text-surface',
        step.status === 'current' && 'border-accent bg-accent text-accent-fg',
        step.status === 'running' && 'border-info text-info',
        step.status === 'blocked' && 'border-danger bg-danger-soft text-danger',
        step.status === 'todo' && 'border-border-strong text-fg-muted',
      )}
    >
      {step.status === 'done' ? (
        <IconCheck size={13} />
      ) : step.status === 'blocked' ? (
        <IconAlert size={13} />
      ) : step.status === 'running' ? (
        <Spinner size={12} />
      ) : (
        n
      )}
    </span>
  );
}

/**
 * Go live as one visible sequence on the assistant page: publish, run the
 * tests, check the bar, make live (UX-38). It drives the existing endpoints
 * through the same confirmations as the versions table, and stops with a
 * plain reason when a step is not met (research note 10, risk 2).
 */
export function GoLivePanel({
  tenantId,
  name,
  versions,
  onOpenTests,
}: {
  tenantId: string;
  name: string;
  versions: readonly Node[];
  /** Opens the Tests tab on a version, where the go-live check is listed in full. */
  onOpenTests: (version: number) => void;
}) {
  const target = goLiveTarget(versions);
  const version = target?.version ?? 0;
  const published = target?.state === 'published';
  const evals = useQuery({ ...evalsQuery(tenantId, name, version), enabled: Boolean(target) });
  const list = evals.data?.data ?? [];
  const running = list.some((e) => e.status === 'pending' || e.status === 'running');
  const gate = useQuery({
    ...gateQuery(tenantId, name, version),
    enabled: published,
    refetchInterval: running ? 5_000 : false,
  });
  const policy = useQuery(evalPolicyQuery(tenantId, name));
  const perms = usePermissions();
  const cannotPublish = deniedReason(perms, 'nodes.publish', tenantId);
  const cannotRun = perms.can('nodes.run', tenantId) ? null : NO_RUN(tenantId);
  const [acting, setActing] = useState<VersionAction | null>(null);
  const [testing, setTesting] = useState<EvalSuite | null>(null);

  if (!target) return null;
  const input = {
    version: target,
    evals: list,
    gate: gate.data,
    policy: policy.data?.policy,
  };
  const steps = goLiveSteps(input);
  const need = neededSuites(input);
  const live = versions.find((v) => v.live)?.version;
  const allDone = steps.every((s) => s.status === 'done');
  // Publishing a draft can also make it live only when no bar can apply: the
  // bar is known and has no quality part, and the version calls no tools.
  const noTools = ((target.spec as { tools?: unknown[] }).tools ?? []).length === 0;
  const testsNeeded =
    need.quality ||
    need.safety ||
    !policy.isSuccess ||
    Boolean(policy.data.policy.golden) ||
    !noTools;

  const actionFor = (s: GoLiveStep) => {
    if (s.status !== 'current' && s.status !== 'blocked') return null;
    switch (s.id) {
      case 'publish':
        return (
          <GatedButton
            size="sm"
            variant="primary"
            deniedReason={cannotPublish}
            onClick={() => setActing('publish')}
          >
            Publish v{version}
          </GatedButton>
        );
      case 'test':
        return (
          <span className="flex flex-wrap gap-2">
            {(need.quality || !need.safety) && (
              <GatedButton
                size="sm"
                variant="primary"
                deniedReason={cannotRun}
                onClick={() => setTesting('golden')}
              >
                Run quality tests
              </GatedButton>
            )}
            {need.safety && (
              <GatedButton
                size="sm"
                variant={need.quality ? 'secondary' : 'primary'}
                deniedReason={cannotRun}
                onClick={() => setTesting('injection')}
              >
                Run safety tests
              </GatedButton>
            )}
          </span>
        );
      case 'check':
        return (
          <Button size="sm" onClick={() => onOpenTests(version)}>
            See what is missing
          </Button>
        );
      case 'live':
        return (
          <GatedButton
            size="sm"
            variant="primary"
            deniedReason={cannotPublish}
            onClick={() => setActing('promote')}
          >
            Make v{version} live
          </GatedButton>
        );
    }
  };

  return (
    <Card role="region" aria-label="Go live" className="mb-5">
      <CardHeader
        title={allDone ? `v${version} is live` : `Go live with v${version}`}
        description={
          allDone
            ? 'New requests go to this version. Create a new version to change it.'
            : 'Four steps, in order. Each one says where it stands.'
        }
        actions={<LearnMore doc={doc('guides/tests-and-go-live', 'go-live')} />}
      />
      <ol className="grid gap-px bg-border md:grid-cols-4" aria-label="Steps to go live">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.status === 'current' || s.status === 'blocked' ? 'step' : undefined}
            className="flex flex-col gap-2 bg-surface p-4"
          >
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <Marker step={s} n={i + 1} />
              {s.title}
              <span className="sr-only">: {STATUS_TEXT[s.status]}</span>
            </p>
            <p
              className={cn(
                'text-[12.5px]',
                s.status === 'blocked' ? 'text-danger' : 'text-fg-muted',
              )}
            >
              {s.detail}
            </p>
            {actionFor(s)}
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">
        {steps.find((s) => s.status === 'running')?.detail ?? ''}
      </p>
      <VersionDialog
        action={acting}
        version={acting ? target : null}
        live={live}
        promoteByDefault={!testsNeeded}
        onClose={() => {
          setActing(null);
          void gate.refetch();
        }}
      />
      {testing && (
        <StartEvalDrawer
          tenantId={tenantId}
          name={name}
          version={version}
          initialSuite={testing}
          hasWriteTools={Boolean(gate.data?.has_write_tools)}
          onClose={() => setTesting(null)}
          onStarted={() => setTesting(null)}
        />
      )}
    </Card>
  );
}
