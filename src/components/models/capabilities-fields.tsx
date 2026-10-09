import type { ModelCapabilities, ReasoningControl, ReasoningMode } from '@/api/types';
import { REASONING_CONTROLS, REASONING_MODES } from '@/api/types';
import { Checkbox, Field, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { REASONING_CONTROL_LABEL, REASONING_LABEL } from '@/lib/labels';

type Caps = Required<ModelCapabilities>;

/** Editor for `ModelCapabilities`, shared by the add-model form and discovery. */
export function CapabilitiesFields({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Caps;
  onChange: (next: Caps) => void;
  disabled?: boolean;
  className?: string;
}) {
  const set = (patch: Partial<Caps>) => onChange({ ...value, ...patch });
  const noReasoning = value.reasoning === 'none';

  return (
    <fieldset className={cn('flex flex-col gap-3', className)} disabled={disabled}>
      <legend className="mb-1.5 text-[12.5px] font-medium text-fg">Capabilities</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox
          label="Tools"
          checked={value.tools}
          onChange={(e) => set({ tools: e.target.checked })}
        />
        <Checkbox
          label="Vision"
          checked={value.vision}
          onChange={(e) => set({ vision: e.target.checked })}
        />
        <Checkbox
          label={
            <span>
              Inline <code className="font-mono text-[12px]">&lt;think&gt;</code> tags
            </span>
          }
          checked={value.inline_think_tags}
          disabled={noReasoning}
          onChange={(e) => set({ inline_think_tags: e.target.checked })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reasoning">
          {({ id }) => (
            <Select
              id={id}
              value={value.reasoning}
              onChange={(e) => {
                const reasoning = e.target.value as ReasoningMode;
                set(
                  reasoning === 'none'
                    ? { reasoning, reasoning_control: 'none', inline_think_tags: false }
                    : { reasoning },
                );
              }}
            >
              {REASONING_MODES.map((r) => (
                <option key={r} value={r}>
                  {REASONING_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reasoning control">
          {({ id }) => (
            <Select
              id={id}
              value={value.reasoning_control}
              disabled={noReasoning}
              onChange={(e) => set({ reasoning_control: e.target.value as ReasoningControl })}
            >
              {REASONING_CONTROLS.map((r) => (
                <option key={r} value={r}>
                  {REASONING_CONTROL_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </fieldset>
  );
}
