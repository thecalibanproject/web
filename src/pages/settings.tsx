import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { healthQuery } from '@/api/queries';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  CopyButton,
  ErrorState,
  InlineLoading,
  PageHeader,
} from '@/components/ui';
import { IconLogout } from '@/components/ui/icons';
import { clearToken } from '@/lib/auth';
import { apiBaseUrl, dataPlaneUrl } from '@/lib/urls';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
      <dt className="text-[12.5px] text-fg-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Snippets({
  topic,
  items,
}: {
  topic?: string;
  items: ReadonlyArray<{ title: string; code: string }>;
}) {
  return items.map((s) => (
    <section key={s.title}>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-fg-muted">{s.title}</h3>
        <CopyButton value={s.code} />
      </div>
      <CodeBlock code={s.code} label={`${topic ? `${topic}: ` : ''}${s.title} snippet`} />
    </section>
  ));
}

export function SettingsPage() {
  const health = useQuery(healthQuery());
  const navigate = useNavigate();
  const qc = useQueryClient();
  const api = `${apiBaseUrl()}/api/v1`;
  const dp = dataPlaneUrl();

  const python = `from openai import OpenAI

client = OpenAI(
    base_url="${dp}",
    api_key="cal_…",  # a tenant API key minted in Tenants → API keys
)
client.chat.completions.create(
    model="caliban/auto",
    messages=[{"role": "user", "content": "Hello"}],
)`;

  const ts = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${dp}',
  apiKey: process.env.CALIBAN_API_KEY, // cal_…
});`;

  const curl = `curl ${dp}/chat/completions \\
  -H "Authorization: Bearer $CALIBAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"caliban/auto","messages":[{"role":"user","content":"Hello"}]}'`;

  const embeddingsPy = `emb = client.embeddings.create(
    model="local/qwen3-embedding-8b",  # any catalogue model of kind "embedding"
    input=["How do I rotate a BYOK key?", "Key rotation runbook"],
)
vectors = [d.embedding for d in emb.data]`;

  const embeddingsCurl = `curl ${dp}/embeddings \\
  -H "Authorization: Bearer $CALIBAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"local/qwen3-embedding-8b","input":["How do I rotate a BYOK key?"]}'`;

  const reasoningPy = `# Hybrid reasoning models (e.g. Qwen3) think by default. Turn it off per request;
# Caliban maps this to enable_thinking=false or reasoning_effort for the model family.
client.chat.completions.create(
    model="local/qwen3-30b-a3b",
    messages=[{"role": "user", "content": "Summarise this ticket in one line."}],
    extra_body={"caliban": {"reasoning": "off"}},  # off | low | medium | high
)`;

  const reasoningCurl = `curl ${dp}/chat/completions \\
  -H "Authorization: Bearer $CALIBAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"local/qwen3-30b-a3b",
       "messages":[{"role":"user","content":"Summarise this ticket in one line."}],
       "caliban":{"reasoning":"off"}}'`;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Endpoints, connection snippets and console preferences."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Endpoints" />
          <dl className="divide-y divide-border">
            <Row label="Admin API (control plane)">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[12.5px] break-all">{api}</code>
                <CopyButton value={api} />
              </div>
            </Row>
            <Row label="Data plane (OpenAI-compatible)">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[12.5px] break-all">{dp}</code>
                <CopyButton value={dp} />
              </div>
              <p className="mt-1 text-[12px] text-fg-subtle">
                Assumes the data plane listens on port 8080 of this host. Behind a load balancer,
                use its address instead.
              </p>
            </Row>
            <Row label="Control plane status">
              {health.isPending ? (
                <InlineLoading label="Checking…" />
              ) : health.isError ? (
                <ErrorState error={health.error} className="m-0" />
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone={health.data.status === 'ok' ? 'ok' : 'warn'} dot>
                    {health.data.status}
                  </Badge>
                  <span>v{health.data.version}</span>
                  <Badge>{health.data.mode}</Badge>
                  {health.data.config_version && (
                    <span className="text-fg-muted">config {health.data.config_version}</span>
                  )}
                </span>
              )}
            </Row>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Connect an app"
            description={
              <>
                Point your OpenAI SDK <code className="font-mono">base_url</code> at{' '}
                <code className="font-mono">http://&lt;host&gt;:8080/v1</code> and use a tenant API
                key.
              </>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            <Snippets
              items={[
                { title: 'Python (openai)', code: python },
                { title: 'TypeScript (openai)', code: ts },
                { title: 'curl', code: curl },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Embeddings"
            description={
              <>
                <code className="font-mono">POST /v1/embeddings</code> serves open embedding models
                on-prem or BYOK providers. Inputs leaving the trust boundary are PII-masked.
              </>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            <Snippets
              topic="Embeddings"
              items={[
                { title: 'Python (openai)', code: embeddingsPy },
                { title: 'curl', code: embeddingsCurl },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Reasoning (Qwen3 thinking toggle)"
            description={
              <>
                Set <code className="font-mono">caliban.reasoning</code> to{' '}
                <code className="font-mono">off</code>, <code className="font-mono">low</code>,{' '}
                <code className="font-mono">medium</code> or <code className="font-mono">high</code>
                . OpenAI&apos;s <code className="font-mono">reasoning_effort</code> is accepted too.
              </>
            }
          />
          <div className="flex flex-col gap-4 p-4">
            <Snippets
              topic="Reasoning"
              items={[
                { title: 'Python (openai)', code: reasoningPy },
                { title: 'curl', code: reasoningCurl },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Console" />
          <dl className="divide-y divide-border">
            <Row label="Theme">
              <div className="w-48">
                <ThemeToggle />
              </div>
            </Row>
            <Row label="Privacy">
              <p className="text-[13px]">
                Served from your control plane. No CDN, remote fonts, analytics or telemetry. The
                admin token is kept in this tab&apos;s sessionStorage only.
              </p>
            </Row>
            <Row label="Session">
              <Button
                icon={<IconLogout size={14} />}
                onClick={() => {
                  clearToken();
                  qc.clear();
                  void navigate({ to: '/login' });
                }}
              >
                Sign out
              </Button>
            </Row>
          </dl>
        </Card>
      </div>
    </>
  );
}
