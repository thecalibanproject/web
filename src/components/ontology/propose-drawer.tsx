import { useState } from 'react';
import { useProposeOntology } from '@/api/queries';
import { breakingChanges, parseProposals, readBreaking } from '@/lib/ontology';
import { formatInt } from '@/lib/format';
import { Button, Drawer, Field, FormError, Textarea } from '../ui';
import { AcknowledgedBreaking, BreakingChanges } from './breaking-changes';

const EXAMPLE = `[
  {
    "id": "Clinic",
    "kind": "entity",
    "name": "Clinic",
    "description": "A site where patients are seen",
    "spec": { "datasource": "care_db", "object": "clinics" }
  }
]`;

/**
 * Proposals made outside Caliban (an exported model, a curated file): written
 * as `proposed` in one ontology version, for review in the queue.
 */
export function ProposeDrawer({
  tenantId,
  open,
  onClose,
}: {
  tenantId: string;
  open: boolean;
  onClose: () => void;
}) {
  const propose = useProposeOntology(tenantId);
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const breaking = breakingChanges(propose.error);

  const close = () => {
    setText('');
    setParseError(null);
    setAck(false);
    propose.reset();
    onClose();
  };
  const submit = (acknowledgeBreaking: boolean) => {
    const parsed = parseProposals(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setParseError(null);
    propose.mutate({ elements: parsed.elements, acknowledgeBreaking });
  };

  const result = propose.data;
  return (
    <Drawer
      open={open}
      onClose={close}
      title="Import entries"
      description="Entries made outside Caliban, such as an export or a curated file. They arrive as suggestions in one new version of the dictionary, for review."
      footer={
        result ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              loading={propose.isPending && !ack}
              disabled={!text.trim() || propose.isPending || breaking !== null}
              onClick={() => submit(false)}
            >
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-[13px]">
          <p role="status" className="text-ok">
            {result.proposed
              ? `Added ${formatInt(result.proposed)} suggestion${result.proposed === 1 ? '' : 's'} in version ${result.version}.`
              : `Nothing added: every entry matches version ${result.version} already.`}
          </p>
          <p className="text-fg-muted">
            Skipped: {formatInt(result.skipped)} {result.skipped === 1 ? 'entry is' : 'entries are'}{' '}
            unchanged, so {result.skipped === 1 ? 'it keeps its' : 'they keep their'} review
            decisions.
          </p>
          <AcknowledgedBreaking tenantId={tenantId} changes={readBreaking(result.breaking) ?? []} />
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-[13px]">
          <Field
            label="Entries (JSON)"
            hint={
              'A JSON array of entries, or an export of the dictionary ({"elements": [...]}). Each needs id, kind and name. Unchanged entries are skipped and keep their decisions; a changed entry that was in use is withdrawn until it is approved again.'
            }
            error={parseError ?? undefined}
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                value={text}
                placeholder={EXAMPLE}
                onChange={(e) => {
                  setText(e.target.value);
                  setParseError(null);
                  setAck(false);
                  propose.reset();
                }}
                rows={14}
                spellCheck={false}
                className="font-mono text-[12px]"
              />
            )}
          </Field>
          {breaking ? (
            <BreakingChanges
              tenantId={tenantId}
              changes={breaking}
              message={propose.error instanceof Error ? propose.error.message : ''}
              acknowledged={ack}
              onAcknowledge={setAck}
              disabled={propose.isPending}
            >
              <Button
                variant="danger"
                disabled={!ack}
                loading={propose.isPending}
                onClick={() => submit(true)}
              >
                Import anyway
              </Button>
            </BreakingChanges>
          ) : (
            <FormError error={propose.error} />
          )}
        </div>
      )}
    </Drawer>
  );
}
