import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { nodesQuery, ragCollectionsQuery } from '@/api/queries';
import type { Node } from '@/api/types';
import { doc } from '@/lib/docs';
import {
  BLANK_TEMPLATE,
  defaultValues,
  fillTemplate,
  missingFields,
  TEMPLATES,
  type AssistantTemplate,
  type TemplateField,
  type TemplateValues,
} from '@/lib/templates';
import { cn } from '@/lib/cn';
import { LearnMore } from '../help/learn-more';
import { Button, Field, Input, Select } from '../ui';
import { NodeEditor } from './node-editor';

type Step = 'start' | 'fill' | 'edit';

/**
 * "New assistant": start from a template (or blank), fill in what is yours
 * (names, document library, data, specialists), then review every setting in
 * the form, with the JSON view next to it, before creating version 1.
 */
export function NewAssistant({
  tenantId,
  onCancel,
  onCreated,
}: {
  tenantId: string | undefined;
  onCancel: () => void;
  onCreated: (node: Node) => void;
}) {
  const [step, setStep] = useState<Step>('start');
  const [template, setTemplate] = useState<AssistantTemplate>(TEMPLATES[0]!);
  const [values, setValues] = useState<TemplateValues>(() => defaultValues(TEMPLATES[0]!));
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);

  const pick = (t: AssistantTemplate) => {
    setTemplate(t);
    setValues(defaultValues(t));
  };

  if (step === 'edit' && spec) {
    return (
      <div className="flex h-full flex-col gap-3">
        <StepBar step={3} />
        <p className="text-[12.5px] text-fg-muted">
          Review the settings{template.id !== BLANK_TEMPLATE.id ? ` from ${template.title}` : ''}.
          It is created as a draft; nothing answers requests until a version is live.{' '}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStep(template.fields.length ? 'fill' : 'start')}
          >
            Back
          </Button>
        </p>
        <NodeEditor
          defaultTenant={tenantId}
          defaultName={template.id === BLANK_TEMPLATE.id ? '' : template.id}
          initialSpec={spec}
          onCancel={onCancel}
          onCreated={onCreated}
        />
      </div>
    );
  }

  if (step === 'fill') {
    return (
      <FillStep
        template={template}
        values={values}
        tenantId={tenantId}
        onChange={setValues}
        onBack={() => setStep('start')}
        onNext={() => {
          setSpec(fillTemplate(template, values));
          setStep('edit');
        }}
      />
    );
  }

  return (
    <StartStep
      selected={template}
      onPick={pick}
      onCancel={onCancel}
      onNext={() => {
        if (template.fields.length) setStep('fill');
        else {
          setSpec(fillTemplate(template, values));
          setStep('edit');
        }
      }}
    />
  );
}

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Start from', 'Fill in', 'Review and create'];
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-muted">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i + 1 === step ? 'step' : undefined}
          className={cn(i + 1 === step && 'font-semibold text-fg')}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

function StartStep({
  selected,
  onPick,
  onNext,
  onCancel,
}: {
  selected: AssistantTemplate;
  onPick: (t: AssistantTemplate) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const name = useId();
  return (
    <form
      aria-label="Start from"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <StepBar step={1} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium">Start from</legend>
        {TEMPLATES.map((t) => (
          <label
            key={t.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-[13px] transition-colors duration-(--duration-fast)',
              selected.id === t.id
                ? 'border-accent bg-accent-soft'
                : 'border-border-strong hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={t.id}
              checked={selected.id === t.id}
              onChange={() => onPick(t)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block font-medium">{t.title}</span>
              <span className="block text-fg-muted">{t.description}</span>
              {t.source && (
                <span className="mt-0.5 block text-[12px] text-fg-muted">From the {t.source}.</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-[12.5px]">
        <LearnMore doc={doc('guides/assistants', 'create-from-template')}>
          About the templates
        </LearnMore>
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary">
          Next
        </Button>
      </div>
    </form>
  );
}

function FillStep({
  template,
  values,
  tenantId,
  onChange,
  onBack,
  onNext,
}: {
  template: AssistantTemplate;
  values: TemplateValues;
  tenantId: string | undefined;
  onChange: (v: TemplateValues) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const missing = missingFields(template, values);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onNext();
  };
  return (
    <form
      aria-label={`Fill in ${template.title}`}
      className="flex flex-col gap-4"
      onSubmit={submit}
    >
      <StepBar step={2} />
      <p className="text-[13px]">
        <span className="font-medium">{template.title}</span>: fill in what is specific to you. You
        can change everything on the next step.
      </p>
      {template.fields.map((f) => (
        <TemplateFieldInput
          key={f.key}
          field={f}
          tenantId={tenantId}
          value={values[f.key] ?? ''}
          onChange={(v) => onChange({ ...values, [f.key]: v })}
        />
      ))}
      {missing.length > 0 && (
        <p className="text-[12.5px] text-fg-muted">
          Still empty: {missing.join(', ')}. You can continue and fill them in later.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary">
          Next
        </Button>
      </div>
    </form>
  );
}

function TemplateFieldInput({
  field,
  tenantId,
  value,
  onChange,
}: {
  field: TemplateField;
  tenantId: string | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const libraries = useQuery({
    ...ragCollectionsQuery(tenantId ?? ''),
    enabled: field.kind === 'library' && Boolean(tenantId),
  });
  const nodes = useQuery({
    ...nodesQuery(tenantId),
    enabled: field.kind === 'assistant' && Boolean(tenantId),
  });
  const options =
    field.kind === 'library'
      ? (libraries.data ?? []).map((c) => ({ value: c.name, label: c.name }))
      : field.kind === 'assistant'
        ? (nodes.data ?? [])
            .filter((n) => n.state === 'published')
            .sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version)
            .map((n) => ({
              value: `${n.name}@v${n.version}`,
              label: `${n.name}, version ${n.version}${n.live ? ' (live)' : ''}`,
            }))
        : null;
  return (
    <Field label={field.label} hint={field.hint}>
      {({ id, describedBy }) =>
        options && options.length > 0 ? (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            dir="auto"
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={field.kind === 'text' ? undefined : 'font-mono'}
          />
        )
      }
    </Field>
  );
}
