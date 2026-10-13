import { scenario, me, helpers } from './data.mjs';
const { versionsOf, goldenSet, evals, evalPolicy, gate, summaryOf, ago } = helpers;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}
const notFound = (res, what) =>
  send(res, 404, { error: { message: `${what} not found`, type: 'not_found' } });

export function route(method, path, query, s, body) {
  let m;
  if (path === '/auth/config')
    return [200, { sso_enabled: false, break_glass_enabled: true, login_url: null }];
  if (path === '/auth/me') return [200, me];
  if (path === '/api/v1/health')
    return [200, { status: 'ok', version: '0.9.0', mode: 'control-plane', store: 'postgres' }];
  if (path === '/api/v1/tenants' && method === 'GET') return [200, s.tenants];
  if (path === '/api/v1/models') return [200, s.models];
  if (path === '/api/v1/providers') return [200, s.providers];
  if ((m = path.match(/^\/api\/v1\/providers\/([^/]+)\/health$/))) return [200, s.providerHealth];
  if (path === '/api/v1/datasources') {
    const t = query.get('tenant_id');
    return [200, s.datasources.filter((d) => !t || d.tenant_id === t)];
  }
  if ((m = path.match(/^\/api\/v1\/datasources\/([^/]+)\/introspection$/)))
    return [
      200,
      {
        id: 'job1',
        datasource_id: m[1],
        tenant_id: 'cedar-bank',
        status: 'succeeded',
        objects: 14,
        proposed: 9,
        skipped: 2,
        version: 7,
        started_at: ago(60 * 3),
        finished_at: ago(60 * 3 - 1),
      },
    ];
  if (path === '/api/v1/ontology') {
    const t = query.get('tenant_id');
    return [200, s.ontology[t] ?? { tenant_id: t, version: 0, elements: [] }];
  }
  if (path === '/api/v1/nodes') {
    const t = query.get('tenant_id');
    const all = Object.values(s.nodes).flat();
    return [200, all.filter((n) => !t || n.tenant_id === t)];
  }
  if (path === '/api/v1/usage') {
    const t = query.get('tenant_id');
    return [200, s.usage(t)];
  }
  if (path === '/api/v1/audit') return [200, s.audit];
  if (path === '/api/v1/users') return [200, s.users];
  if (path === '/api/v1/role-bindings')
    return [
      200,
      {
        bindings: [],
        group_mappings: [
          { group: 'caliban-admins', role: 'admin', tenant_id: null, source: 'config' },
        ],
        groups_claim: 'groups',
      },
    ];

  if (!(m = path.match(/^\/api\/v1\/tenants\/([^/]+)(\/.*)?$/))) return null;
  const tid = decodeURIComponent(m[1]);
  const rest = m[2] ?? '';
  const tenant = s.tenants.find((t) => t.id === tid);
  if (!tenant)
    return [404, { error: { message: `Workspace ${tid} not found`, type: 'not_found' } }];
  if (rest === '') {
    if (method === 'PATCH') return [200, { ...tenant, ...body }];
    return [200, tenant];
  }
  if (rest === '/api-keys') return [200, s.apiKeys[tid] ?? []];
  if (rest === '/provider-keys') return [200, []];
  if (rest === '/intents')
    return [200, s.intents[tid] ?? { tenant_id: tid, intents: [], removed: [] }];
  if (rest === '/routes') return [200, [{ intent: 'triage', models: ['local/qwen3-32b'] }]];
  if (rest === '/tool-servers') return [200, s.toolServers[tid] ?? []];
  if ((m = rest.match(/^\/tool-servers\/([^/]+)\/tools$/)))
    return [
      200,
      [
        {
          id: 'tm1',
          tenant_id: tid,
          server: m[1],
          name: 'issue_refund',
          description: 'Refunds a card payment to the account on file.',
          input_schema: { type: 'object' },
          pin: 'sha256:2031c9e4d1a7b0f3',
          findings: [],
          status: 'approved',
          discovered_at: ago(60 * 24 * 7),
          approved_at: ago(60 * 24 * 7),
          approved_by: 'salma.haddad@cedar-bank.example',
          findings_acknowledged: false,
          network: true,
        },
      ],
    ];
  if (rest === '/node-spend')
    return [
      200,
      {
        tenant_id: tid,
        day: ago(0).slice(0, 10),
        month: ago(0).slice(0, 7),
        today_usd: s.nodes[tid] ? 21.4 : 0,
        month_usd: s.nodes[tid] ? 312.8 : 0,
        caps: tenant.node_spend_caps ?? {},
        remaining: { daily_usd: 3.6, monthly_usd: 87.2 },
        capped: false,
      },
    ];
  if (rest === '/inbox')
    return [200, { object: 'list', content_visible: true, data: s.inbox[tid] ?? [] }];
  if (rest === '/runs') {
    const status = query.get('status');
    let list = s.runs[tid] ?? [];
    if (status === 'failed') list = list.filter((r) => r.status === 'failed');
    return [200, { object: 'list', data: list.map(summaryOf), next_cursor: null }];
  }
  if ((m = rest.match(/^\/runs\/([^/]+)$/))) {
    const r = (s.runs[tid] ?? []).find((x) => x.id === m[1]);
    return r
      ? [200, r]
      : [404, { error: { message: 'Conversation not found', type: 'not_found' } }];
  }
  if ((m = rest.match(/^\/runs\/([^/]+)\/golden-case$/))) return [201, {}];
  if (rest === '/eval-key')
    return [
      200,
      { tenant_id: tid, key: (s.apiKeys[tid] ?? []).find((k) => k.purpose === 'eval') ?? null },
    ];
  if (rest === '/evals') {
    const v = Number(query.get('version'));
    const list = v ? (evals[v] ?? []) : Object.values(evals).flat();
    return [200, { object: 'list', data: tid === 'cedar-bank' ? list : [], next_cursor: null }];
  }
  if ((m = rest.match(/^\/evals\/([^/]+)$/))) {
    const e = Object.values(evals)
      .flat()
      .find((x) => x.id === m[1]);
    return e ? [200, e] : [404, { error: { message: 'Test run not found', type: 'not_found' } }];
  }
  if ((m = rest.match(/^\/nodes\/([^/]+)\/versions$/)))
    return [200, versionsOf(tid, decodeURIComponent(m[1]))];
  if ((m = rest.match(/^\/nodes\/([^/]+)\/diff$/))) {
    return [
      200,
      {
        name: m[1],
        from: { version: Number(query.get('from')) },
        to: { version: Number(query.get('to')) },
        identical: false,
        changes: [
          {
            path: '/prompt/system',
            op: 'changed',
            from: 'You are the support assistant of Cedar Bank.',
            to: 'You are the support assistant of Cedar Bank. Keep replies under 120 words.',
          },
        ],
      },
    ];
  }
  if ((m = rest.match(/^\/nodes\/([^/]+)\/eval-policy$/))) return [200, evalPolicy(m[1])];
  if ((m = rest.match(/^\/nodes\/([^/]+)\/versions\/(\d+)\/golden-set$/))) {
    if (tid !== 'cedar-bank')
      return [404, { error: { message: 'No test cases', type: 'not_found' } }];
    return [200, goldenSet(m[1], Number(m[2]))];
  }
  if ((m = rest.match(/^\/nodes\/([^/]+)\/versions\/(\d+)\/gate$/)))
    return [200, gate(m[1], Number(m[2]))];
  if (rest === '/rag/collections') return [200, s.collections[tid] ?? []];
  if (rest === '/rag/models')
    return [
      200,
      {
        embedding: [{ id: 'local/bge-m3', provider: 'local-vllm', trust_tier: 't0_sovereign' }],
        rerank: [],
      },
    ];
  if ((m = rest.match(/^\/rag\/collections\/([^/]+)$/))) {
    const c = (s.collections[tid] ?? []).find((x) => x.name === decodeURIComponent(m[1]));
    return c
      ? [200, { ...c, used_by: ['triage', 'careguide'] }]
      : [404, { error: { message: 'Library not found', type: 'not_found' } }];
  }
  if ((m = rest.match(/^\/rag\/collections\/([^/]+)\/documents$/))) {
    let docs = s.documents[`${tid}/${decodeURIComponent(m[1])}`] ?? [];
    const st = query.get('status');
    if (st) docs = docs.filter((d) => d.status === st);
    return [200, { documents: docs, next_cursor: null }];
  }
  if ((m = rest.match(/^\/rag\/collections\/([^/]+)\/documents\/([^/]+)$/))) {
    const d = (s.documents[`${tid}/${decodeURIComponent(m[1])}`] ?? []).find(
      (x) => x.doc_id === decodeURIComponent(m[2]),
    );
    return d
      ? [200, { doc_id: d.doc_id, live_version: d.live_version, versions: [d] }]
      : [404, { error: { message: 'Document not found', type: 'not_found' } }];
  }
  return null;
}

export default function mockControlPlane() {
  return {
    name: 'caliban-mock-control-plane',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return next();
        try {
          const name = /qa_scenario=(\w+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'busy';
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const body = raw ? JSON.parse(raw) : undefined;
          if (url.pathname.startsWith('/api/') && !req.headers.authorization) {
            return send(res, 401, { error: { message: 'Sign in first', type: 'unauthorized' } });
          }
          const out = route(req.method, url.pathname, url.searchParams, scenario(name), body);
          if (!out) return notFound(res, url.pathname);
          return send(res, out[0], out[1]);
        } catch {
          return send(res, 400, {
            error: { message: 'Mock request could not be read', type: 'bad_request' },
          });
        }
      });
    },
  };
}
