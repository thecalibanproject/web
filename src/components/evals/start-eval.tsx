import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import {
  apiKeysQuery,
  evalKeyQuery,
  goldenSetQuery,
  modelsQuery,
  useStartEval,
} from '@/api/queries';
import type { Eval, EvalStart, EvalSuite } from '@/api/types';
import { splitList } from '@/lib/apiKeys';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { EVAL_SUITE_LABEL } from '@/lib/evals';
import { Advanced } from '../help/advanced';
import { LearnMore } from '../help/learn-more';
import { Button, Drawer, Field, FormError, Input, Select, Textarea } from '../ui';

const SUITE_HINT: Record<EvalSuite, string> = {
  golden:
    'Runs every test case a few times, and reports how many passed every try, the cost of a good answer and how long answers took.',
  injection:
    'Hides attacks in the data the assistant reads, with stand-in tools (no real system is called), and reports how many were blocked.',
};

/**
 * Starts the quality tests (golden set) or the safety tests (injection
 * suite) of a published version. The defaults fit almost every case; tries,
 * parallelism, a subset of cases and the grader are under Advanced.
 */
export function StartEvalDrawer({
  tenantId,
  name,
  version,
  initialSuite = 'golden',
  hasWriteTools = false,
  onClose,
  onStarted,
}: {
  tenantId: string;
  name: string;
  version: number;
  initialSuite?: EvalSuite;
  /** The version can change things in other systems (write tools). */
  hasWriteTools?: boolean;
  onClose: () => void;
  onStarted: (e: Eval) => void;
}) {
  const start = useStartEval(tenantId, name, version);
  const keys = useQuery(apiKeysQuery(tenantId));
  const evalKey = useQuery(evalKeyQuery(tenantId));
  const golden = useQuery(goldenSetQuery(tenantId, name, version));
  const models = useQuery(modelsQuery());
  // App keys allowed to run this assistant: no allowlist, or one naming it.
  const usable = (keys.data ?? []).filter(
    (k) => k.purpose !== 'eval' && (k.nodes == null || k.nodes.includes(name)),
  );
  const managed = evalKey.data?.key;
  const caseIds = (golden.data?.cases ?? []).map((c) => c.id);
  const chatModels = (models.data ?? []).filter((m) => m.kind === 'chat');
  const suiteName = useId();

  const [suite, setSuite] = useState<EvalSuite>(initialSuite);
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
      if (!Number.isInteger(n) || n < lo || n > hi) {
        errs[field] = `A whole number from ${lo} to ${hi}.`;
      }
      return n;
    };
    const kn = int(k, 1, 10, 'k');
    const cn = int(concurrency, 1, 16, 'concurrency');
    let input: unknown;
    if (suite === 'injection' && inputCase === '__custom') {
      const t = inputText.trim();
      try {
        input = JSON.parse(t) as unknown;
      } catch {
        // Plain text is sent as a string.
        input = t;
      }
      if (!t) errs.input = 'Write the request the attacks ride on.';
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
      title={`Run tests of ${name} v${version}`}
      description="Tests run like real conversations, with the workspace's test key, and their cost counts toward its usage."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="start-eval" loading={start.isPending}>
            {suite === 'golden' ? 'Run quality tests' : 'Run safety tests'}
          </Button>
        </>
      }
    >
      <form id="start-eval" onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12.5px] font-medium">Which tests</legend>
          {(['golden', 'injection'] as const).map((s) => (
            <label
              key={s}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-md border p-3 text-[13px]',
                suite === s ? 'border-accent bg-accent-soft' : 'border-border-strong',
              )}
            >
              <input
                type="radio"
                name={suiteName}
                value={s}
                checked={suite === s}
                onChange={() => setSuite(s)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block font-medium">{EVAL_SUITE_LABEL[s]}</span>
                <span className="block text-[12.5px] text-fg-muted">{SUITE_HINT[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {suite === 'golden' && hasWriteTools && (
          <p
            role="note"
            className="rounded-md border border-info/40 bg-info-soft px-3 py-2 text-[12.5px] text-fg"
          >
            This assistant can change things in other systems. During tests, those actions go to a
            stand-in that answers like the real system: nothing real is changed.{' '}
            <LearnMore doc={doc('guides/tests-and-go-live', 'write-tools-in-tests')} />
          </p>
        )}
        {suite === 'golden' && golden.isSuccess && !golden.data && (
          <p role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            v{version} has no test cases yet: add some first, or save a conversation as a test.
          </p>
        )}
        <Field
          label="Runs as"
          error={errors.key}
          hint={
            keyId
              ? 'Its limits apply to the tests, and their usage counts as its own.'
              : managed
                ? `The workspace's test key (${managed.prefix}), managed by Caliban.`
                : "The workspace's test key, which Caliban creates for the first tests."
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
              <option value="">The workspace&apos;s test key (recommended)</option>
              {usable.map((key) => (
                <option key={key.id} value={key.id}>
                  App key {key.name} ({key.prefix})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Advanced
          summary={
            suite === 'golden'
              ? '3 tries per test case, 4 at once, every case, automatic grader'
              : '1 try per attack, 4 at once, on the first test case'
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Tries per test case"
              error={errors.k}
              hint={suite === 'golden' ? 'Default 3. Also called k.' : 'Default 1. Also called k.'}
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
            <Field label="Tests at once" error={errors.concurrency} hint="Default 4.">
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
              <Field
                label="Only these test cases"
                hint="Test case names, comma separated. Empty: every case."
              >
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
                label="Grader model"
                hint="The model that checks answers against a description of a good answer, when a test case names none."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={judge}
                    onChange={(e) => setJudge(e.target.value)}
                  >
                    <option value="">Automatic routing (default)</option>
                    {chatModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field
                label="Request the attacks ride on"
                hint="A test case's checks then also measure whether the assistant still did its job."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={inputCase}
                    onChange={(e) => setInputCase(e.target.value)}
                  >
                    <option value="">The first test case</option>
                    {caseIds.map((c) => (
                      <option key={c} value={c}>
                        Test case {c}
                      </option>
                    ))}
                    <option value="__custom">A request I write</option>
                  </Select>
                )}
              </Field>
              {inputCase === '__custom' && (
                <Field
                  label="Request"
                  error={errors.input}
                  hint="Plain text, or JSON when the assistant takes structured input."
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      value={inputText}
                      dir="auto"
                      onChange={(e) => setInputText(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </>
          )}
        </Advanced>
        <FormError error={start.error} />
      </form>
    </Drawer>
  );
}
