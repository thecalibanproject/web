import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/api/auth';
import { providerHealthQuery } from '@/api/queries';
import { Badge } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatMs } from '@/lib/format';

/**
 * Live health of a shared model server, re-probed every 15 s while visible.
 * States: checking (first probe in flight), healthy, unreachable (the control
 * plane could not reach the server) and unknown (the probe itself failed).
 */
export function ProviderHealthBadge({ providerId }: { providerId: string }) {
  const canProbe = usePermissions().can('providers.probe');
  const health = useQuery({ ...providerHealthQuery(providerId), enabled: canProbe });

  if (!canProbe) {
    return (
      <span className="text-fg-subtle" title="Your role cannot probe model servers.">
        n/a
      </span>
    );
  }
  if (health.isPending) {
    return (
      <Badge tone="neutral" dot title="Probing the server’s /models endpoint…">
        Checking…
      </Badge>
    );
  }
  if (health.isError) {
    return (
      <Badge tone="warn" dot title={`Health probe failed: ${errorMessage(health.error)}`}>
        unknown
        <span className="sr-only">: {errorMessage(health.error)}</span>
      </Badge>
    );
  }
  const h = health.data;
  if (h.status === 'ok') {
    const detail = [
      h.latency_ms != null ? formatMs(h.latency_ms) : null,
      h.models != null ? `${h.models} model${h.models === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    return (
      <Badge tone="ok" dot title="The server answered its /models endpoint.">
        Healthy{detail.length ? ` · ${detail.join(' · ')}` : ''}
      </Badge>
    );
  }
  return (
    <Badge tone="danger" dot title={h.error ? `Unreachable: ${h.error}` : 'Unreachable'}>
      Unreachable
      {h.error && <span className="sr-only">: {h.error}</span>}
    </Badge>
  );
}
