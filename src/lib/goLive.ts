import type { Eval, EvalPolicy, GoldenSummary, Node, PromotionGate } from '@/api/types';
import { goldenSummary, injectionSummary, isEvalActive } from './evals';

/**
 * "Go live" as one visible sequence (UX-38, UX-39, UX-43; research note 10,
 * risk 2): publish, run the tests, check the bar, make live. Each step says
 * in plain words where it stands; nothing here calls the API.
 */
export type StepStatus = 'done' | 'current' | 'running' | 'blocked' | 'todo';

export type GoLiveStepId = 'publish' | 'test' | 'check' | 'live';

export interface GoLiveStep {
  id: GoLiveStepId;
  title: string;
  status: StepStatus;
  /** One plain sentence about where this step stands. */
  detail: string;
}

/** The version going live: the newest one not retired. */
export function goLiveTarget(versions: readonly Node[]): Node | undefined {
  return [...versions].reverse().find((v) => v.state !== 'retired');
}

/** A test case of the latest quality tests and how it did. */
export interface CaseResult {
  case: string;
  passed: number;
  tries: number;
}

/** Cases that did not pass every try: those that failed every try first. */
export function failingCases(s: GoldenSummary | null | undefined): CaseResult[] {
  return (s?.by_case ?? [])
    .filter((c) => !c.all_passed)
    .map((c) => ({ case: c.case, passed: c.passed, tries: c.trials }))
    .sort((a, b) => a.passed - b.passed || a.case.localeCompare(b.case));
}

export function failedEveryTry(cases: CaseResult[]): CaseResult[] {
  return cases.filter((c) => c.passed === 0 && c.tries > 0);
}

/** The newest finished eval of a suite (lists are newest first). */
export function latestSucceeded(evals: readonly Eval[], suite: Eval['suite']): Eval | undefined {
  return evals.find((e) => e.suite === suite && e.status === 'succeeded');
}

export interface GoLiveInput {
  version: Node;
  /** The version's evals, newest first. */
  evals: readonly Eval[];
  gate: PromotionGate | undefined;
  policy: EvalPolicy | undefined;
}

/** Which test suites the go-live bar needs for this version. */
export function neededSuites({ gate, policy }: Pick<GoLiveInput, 'gate' | 'policy'>): {
  quality: boolean;
  safety: boolean;
} {
  return {
    quality: Boolean(policy?.golden),
    safety: Boolean(
      gate?.has_write_tools ||
      (gate?.has_untrusted_reads && policy?.injection?.read_only !== 'optional'),
    ),
  };
}

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export function goLiveSteps(input: GoLiveInput): GoLiveStep[] {
  const { version: v, evals, gate } = input;
  const published = v.state === 'published';
  const retired = v.state === 'retired';
  const need = neededSuites(input);
  const running = evals.some((e) => isEvalActive(e.status));
  const quality = latestSucceeded(evals, 'golden');
  const safety = latestSucceeded(evals, 'injection');
  const missing = [
    need.quality && !quality ? 'quality tests' : null,
    need.safety && !safety ? 'safety tests' : null,
  ].filter((x): x is string => x !== null);

  const publish: GoLiveStep = retired
    ? { id: 'publish', title: 'Publish', status: 'blocked', detail: 'This version is retired.' }
    : published
      ? {
          id: 'publish',
          title: 'Publish',
          status: 'done',
          detail: 'Published: the version is frozen and can be tested.',
        }
      : {
          id: 'publish',
          title: 'Publish',
          status: 'current',
          detail: 'A draft. Publishing freezes it so its tests can run.',
        };

  let test: GoLiveStep;
  if (!published) {
    test = { id: 'test', title: 'Run tests', status: 'todo', detail: 'After publishing.' };
  } else if (running) {
    test = { id: 'test', title: 'Run tests', status: 'running', detail: 'Tests are running.' };
  } else if (missing.length > 0) {
    test = {
      id: 'test',
      title: 'Run tests',
      status: 'current',
      detail: `The go-live bar needs ${missing.join(' and ')} of this version.`,
    };
  } else if (!need.quality && !need.safety && !quality && !safety) {
    test = {
      id: 'test',
      title: 'Run tests',
      status: 'done',
      detail: 'The go-live bar needs no tests for this version. Running them is still a good idea.',
    };
  } else {
    test = { id: 'test', title: 'Run tests', status: 'done', detail: 'The tests have run.' };
  }

  const s = quality ? goldenSummary(quality) : null;
  const zero = failedEveryTry(failingCases(s));
  let check: GoLiveStep;
  if (!published || test.status === 'current' || test.status === 'running') {
    check = { id: 'check', title: 'Check the bar', status: 'todo', detail: 'After the tests.' };
  } else if (!gate) {
    check = { id: 'check', title: 'Check the bar', status: 'running', detail: 'Checking.' };
  } else if (gate.allowed) {
    check = {
      id: 'check',
      title: 'Check the bar',
      status: 'done',
      detail:
        zero.length > 0
          ? `Allowed to go live, but ${zero.length} test case${zero.length === 1 ? '' : 's'} failed every try.`
          : 'The results meet the go-live bar.',
    };
  } else {
    const n = gate.problems?.length ?? 0;
    check = {
      id: 'check',
      title: 'Check the bar',
      status: 'blocked',
      detail: `Not ready: ${n} requirement${n === 1 ? ' is' : 's are'} not met.`,
    };
  }

  const live: GoLiveStep = v.live
    ? { id: 'live', title: 'Make live', status: 'done', detail: 'This version is live.' }
    : check.status === 'done'
      ? {
          id: 'live',
          title: 'Make live',
          status: 'current',
          detail: 'Ready. Making it live sends new requests to this version.',
        }
      : { id: 'live', title: 'Make live', status: 'todo', detail: 'Once the bar is met.' };

  return [publish, test, check, live];
}

/** Gate problems that the quality or safety row of this version already states. */
const RESTATED = [
  /needs a finished (golden-set|injection) eval/,
  /^pass\^\d+ = /,
  /ran k = \d+; the bar needs k >=/,
  /injection attacks were blocked/,
  /injection eval \([^)]*\) is inconclusive/,
];

/** A requirement of the go-live check, in plain words, with whether it is met. */
export interface Requirement {
  label: string;
  met: boolean;
  detail?: string;
}

/**
 * The go-live check as a list of requirements. Built from the gate's
 * evidence and problems and the latest results, so a case that failed every
 * try is always named, even when the bar is met.
 */
export function requirements(input: GoLiveInput): Requirement[] {
  const { gate, policy, evals } = input;
  const need = neededSuites(input);
  const out: Requirement[] = [];
  const quality = latestSucceeded(evals, 'golden');
  const s = quality ? goldenSummary(quality) : null;
  if (need.quality && policy?.golden) {
    const bar = policy.golden.min_pass_k;
    const tries = policy.golden.min_k ?? 1;
    const passedAll = s ? s.by_case.filter((c) => c.all_passed).length : 0;
    // The gate records the eval it used as evidence whether or not it met the
    // bar, so "met" comes from the evidence's own numbers, never its presence.
    const ev = gate?.evidence?.golden;
    const fewTries = s ? s.k < tries : false;
    out.push({
      label: `Quality tests: at least ${pct(bar)} of test cases pass all ${tries} ${tries === 1 ? 'try' : 'tries'}`,
      met: Boolean(ev && ev.pass_hat_k >= bar && ev.k >= tries),
      detail: s
        ? `${passedAll} of ${s.cases} test cases passed all ${s.k} ${s.k === 1 ? 'try' : 'tries'} (${pct(s.pass_hat_k)}).${fewTries ? ` The bar needs ${tries} tries per case.` : ''}`
        : 'No quality tests of this version have finished.',
    });
  }
  const inj = latestSucceeded(evals, 'injection');
  const i = inj ? injectionSummary(inj) : null;
  const injBar = gate?.evidence?.injection?.bar ?? policy?.injection?.min_pass_rate ?? null;
  if (need.safety) {
    out.push({
      label: gate?.has_write_tools
        ? 'Safety tests: required, because this version can change things (write tools)'
        : 'Safety tests: required, because what this version reads can steer its answer',
      met: Boolean(
        gate?.evidence?.injection &&
        gate.evidence.injection.pass_rate >= gate.evidence.injection.bar &&
        !gate.evidence.injection.errors,
      ),
      detail: i
        ? i.pass_rate == null || i.errors > 0
          ? 'The last safety tests ended with errors and do not count. Run them again.'
          : `${pct(i.pass_rate)} of attacks blocked${injBar != null && i.pass_rate < injBar ? `; the bar is ${pct(injBar)}` : ''}.`
        : 'No safety tests of this version have finished.',
    });
  }
  for (const p of gate?.problems ?? []) {
    // This version's quality and safety rows already say these, from the
    // same numbers: running the tests, the pass rate and tries per case, the
    // share of attacks blocked and runs that ended with errors. Listing them
    // again would show one requirement twice.
    if (!p.path && RESTATED.some((re) => re.test(p.message))) continue;
    out.push({ label: plainProblem(p.message, p.path), met: false });
  }
  return out;
}

const num = (s: string | undefined) => Number(s ?? 'NaN');

/**
 * The control plane's go-live problems (written for the API, with the call to
 * make) in plain words. Unknown messages are kept as they are.
 */
export function plainProblem(message: string, path?: string): string {
  const m = (re: RegExp) => re.exec(message);
  let out = message;
  let r: RegExpExecArray | null;
  if (/needs a finished golden-set eval/.test(message))
    out = 'Run the quality tests of this version.';
  else if (/needs a finished injection eval/.test(message)) {
    out = 'Run the safety tests of this version.';
  } else if ((r = m(/ran k = (\d+); the bar needs k >= (\d+)/))) {
    out = `The last quality tests tried each case ${r[1]} times; the bar needs ${r[2]}.`;
  } else if ((r = m(/pass\^(\d+) = ([\d.]+).*the bar is ([\d.]+)/))) {
    out = `${pct(num(r[2]))} of test cases passed all ${r[1]} tries; the bar is ${pct(num(r[3]))}.`;
  } else if ((r = m(/cost per success \$([\d.]+).*the bar is \$([\d.]+)/))) {
    out = `A good answer cost $${num(r[1]).toFixed(4)}; the bar allows $${num(r[2]).toFixed(4)}.`;
  } else if (/has no success to price/.test(message)) {
    out = 'No test case passed, so the cost of a good answer is not known.';
  } else if ((r = m(/p95 latency (\d+) ms.*the bar is (\d+) ms/))) {
    out = `95 of 100 answers took up to ${(num(r[1]) / 1000).toFixed(1)} s; the bar is ${(num(r[2]) / 1000).toFixed(1)} s.`;
  } else if ((r = m(/inconclusive: (\d+) trial/))) {
    out = `The last safety tests ended with ${r[1]} error${r[1] === '1' ? '' : 's'}, so they do not count. Run them again.`;
  } else if ((r = m(/(\d+) of (\d+) injection attacks were blocked.*the bar is ([\d.]+)/))) {
    out = `${r[1]} of ${r[2]} attacks were blocked; the bar is ${pct(num(r[3]))}.`;
  }
  return path ? `Sub-assistant ${path.replace(/^node:\/\//, '')}: ${out}` : out;
}
