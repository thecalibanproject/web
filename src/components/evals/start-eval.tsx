import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiKeysQuery, evalKeyQuery, goldenSetQuery, useStartEval } from '@/api/queries';
import type { Eval, EvalStart, EvalSuite } from '@/api/types';
import { EVAL_SUITES } from '@/api/types';
import { splitList } from '@/lib/apiKeys';
import { EVAL_SUITE_LABEL } from '@/lib/evals';
import { Button, Drawer, Field, FormError, Input, Select, Textarea } from '../ui';

const SUITE_HINT: Record<EvalSuite, string> = {
  golden:
    'Runs every case of the golden set k times as ordinary runs, and reports pass^k, pass@1, cost per success and p95 latency.',
  injection:
    'Runs the built-in injection suite against sandboxed tools (no real tool is called), and reports attacks blocked, attack success rate and utility under attack. Versions with write tools need it before they are made live.',
};

/** Starts a golden or injection eval of a published version, as one of the tenant's API keys. */
export function StartEvalDrawer({
  tenantId,
  name,
  version,
  onClose,
  onStarted,
}: {
  tenantId: string;
  name: string;
  version: number;
  onClose: () => void;
  onStarted: (e: Eval) => void;
}) {
  const start = useStartEval(tenantId, name, version);
  const keys = useQuery(apiKeysQuery(tenantId));
  const evalKey = useQuery(evalKeyQuery(tenantId));
  const golden = useQuery(goldenSetQuery(tenantId, name, version));
  // Customer keys allowed to run this node: no allowlist, or one naming it.
  const usable = (keys.data ?? []).filter(
    (k) => k.purpose !== 'eval' && (k.nodes == null || k.nodes.includes(name)),
  );
  const managed = evalKey.data?.key;
  const caseIds = (golden.data?.cases ?? []).map((c) => c.id);

  const [suite, setSuite] = useState<EvalSuite>('golden');
  const [keyId, setKeyId] = useState('');
  const [k, setK] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [cases, setCases] = useState('');
  const [judge, setJudge] = useState('');
  const [inputCase, setInputCase] = useState('');
  const [inputText, setInputText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const int = (s: string, lo: number, hi: number, field: string) => {
      if (!s.trim()) return undefined;
      const n = Number(s);
      if (!Number.isInteger(n) || n < lo || n > hi) errs[field] = `From ${lo} to ${hi}.`;
      return n;
    };
    const kn = int(k, 1, 10, 'k');
    const cn = int(concurrency, 1, 16, 'concurrency');
    let input: unknown;
    if (suite === 'injection' && inputCase === '__custom') {
      try {
        input = JSON.parse(inputText) as unknown;
      } catch (err) {
        errs.input = `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const only = splitList(cases);
    const body: EvalStart = {
      suite,
      ...(keyId ? { api_key_id: keyId } : {}),
      ...(kn !== undefined ? { k: kn } : {}),
      ...(cn !== undefined ? { concurrency: cn } : {}),
      ...(suite === 'golden' && only.length > 0 ? { cases: only } : {}),
      ...(suite === 'golden' && judge.trim() ? { judge_model: judge.trim() } : {}),
      ...(suite === 'injection' && inputCase === '__custom' ? { input } : {}),
      ...(suite === 'injection' && inputCase && inputCase !== '__custom'
        ? { input_case: inputCase }
        : {}),
    };
    start.mutate(body, { onSuccess: onStarted });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Start an eval of ${name} v${version}`}
      description="The eval's runs are ordinary node runs through the gateway pipeline, made, limited and metered as the tenant's eval key, or as an API key you pick."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="start-eval" loading={start.isPending}>
            Start eval
          </Button>
        </>
      }
    >
      <form id="start-eval" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Suite" hint={SUITE_HINT[suite]}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={suite}
              onChange={(e) => setSuite(e.target.value as EvalSuite)}
            >
              {EVAL_SUITES.map((s) => (
                <option key={s} value={s}>
                  {EVAL_SUITE_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Runs as"
          error={errors.key}
          hint={
            keyId
              ? 'Its quotas apply to the eval, and its usage is the eval’s.'
              : managed
                ? `The tenant's eval key (${managed.prefix}), managed by the control plane. Its quotas apply and its usage is metered as the eval's.`
                : "The tenant's eval key, which the control plane creates on the first eval. Its usage is metered as the eval's."
          }
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
            >
              <option value="">The tenant&apos;s eval key (managed)</option>
              {usable.map((key) => (
                <option key={key.id} value={key.id}>
                  API key {key.name} ({key.prefix})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="k (runs per case)"
            error={errors.k}
            hint={suite === 'golden' ? 'Default 3.' : 'Default 1.'}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="numeric"
                value={k}
                onChange={(e) => setK(e.target.value)}
              />
            )}
          </Field>
          <Field label="Concurrency" error={errors.concurrency} hint="Trials in flight. Default 4.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="numeric"
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
              />
            )}
          </Field>
        </div>
        {suite === 'golden' ? (
          <>
            <Field label="Only these cases" hint="Case ids, comma separated. Empty: every case.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={cases}
                  onChange={(e) => setCases(e.target.value)}
                  className="font-mono text-[12px]"
                />
              )}
            </Field>
            <Field
              label="Judge model"
              hint="For llm_judge checks without a model. Empty: caliban/auto."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={judge}
                  onChange={(e) => setJudge(e.target.value)}
                  className="font-mono text-[12px]"
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field
              label="Run input"
              hint="The input the attacks ride on. A golden case's checks then measure utility under attack."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={inputCase}
                  onChange={(e) => setInputCase(e.target.value)}
                >
                  <option value="">The golden set&apos;s first case</option>
                  {caseIds.map((c) => (
                    <option key={c} value={c}>
                      Golden case {c}
                    </option>
                  ))}
                  <option value="__custom">A custom input (JSON)</option>
                </Select>
              )}
            </Field>
            {inputCase === '__custom' && (
              <Field label="Custom input" error={errors.input}>
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    value={inputText}
                    spellCheck={false}
                    onChange={(e) => setInputText(e.target.value)}
                    className="font-mono text-[12px]"
                  />
                )}
              </Field>
            )}
          </>
        )}
        <FormError error={start.error} />
      </form>
    </Drawer>
  );
}
