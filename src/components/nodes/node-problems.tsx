import { isSpecRefusal, nodeProblems, PROBLEM_KIND, type ProblemKind } from '@/lib/nodes';
import { Badge, FormError } from '../ui';
import { IconAlert } from '../ui/icons';

/**
 * The control plane's refusal of a node version, problem by problem, grouped
 * by kind (unpinned tools, unknown scopes, caps exceeded, unsupported code
 * vertices, ...) with what to do about each. Other errors (a conflict, the
 * network, a role) fall back to the plain form error.
 */
export function NodeProblems({ error }: { error: unknown }) {
  if (!error) return null;
  if (!isSpecRefusal(error)) return <FormError error={error} />;
  const { title, problems } = nodeProblems(error.message);
  const kinds = [...new Set(problems.map((p) => p.kind))] as ProblemKind[];
  const count = problems.length;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger-soft p-3 text-[12.5px]"
    >
      <p className="flex items-center gap-1.5 font-medium text-danger">
        <IconAlert size={14} className="shrink-0" />
        {title ?? 'The control plane refused this spec'}: {count} problem{count === 1 ? '' : 's'}
      </p>
      <ul className="mt-2 flex flex-col gap-2.5">
        {kinds.map((kind) => (
          <li key={kind} className="flex flex-col gap-1">
            <span>
              <Badge tone="danger">{PROBLEM_KIND[kind].label}</Badge>
            </span>
            <ul className="list-disc pl-5 font-mono text-[12px] break-words text-fg">
              {problems
                .filter((p) => p.kind === kind)
                .map((p, i) => (
                  <li key={i}>{p.text}</li>
                ))}
            </ul>
            <p className="text-[12px] text-fg-muted">{PROBLEM_KIND[kind].hint}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
