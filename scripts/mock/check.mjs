import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './plugin.mjs';
import { scenario } from './data.mjs';

const get = (path, name = 'busy', query = '') =>
  route('GET', path, new URLSearchParams(query), scenario(name));

test('busy fixtures include both workspaces, waiting approvals and failing tests', () => {
  const [status, tenants] = get('/api/v1/tenants');
  assert.equal(status, 200);
  assert.equal(tenants.length, 2);
  const [, inbox] = get('/api/v1/tenants/cedar-bank/inbox');
  assert.ok(inbox.data.some((item) => item.kind === 'approval'));
  const [, runs] = get('/api/v1/tenants/cedar-bank/runs', 'busy', 'status=failed');
  assert.ok(runs.data.length > 0);
  assert.ok(runs.data.every((run) => run.status === 'failed'));
  const [, evals] = get('/api/v1/tenants/cedar-bank/evals');
  assert.ok(evals.data.length > 0);
});

test('fresh install starts with one workspace and no assistants', () => {
  const [, tenants] = get('/api/v1/tenants', 'fresh');
  assert.equal(tenants.length, 1);
  const [, nodes] = get('/api/v1/nodes', 'fresh');
  assert.deepEqual(nodes, []);
});

test('unknown workspaces and unimplemented routes fail explicitly', () => {
  assert.equal(get('/api/v1/tenants/missing/inbox')[0], 404);
  assert.equal(get('/api/v1/unknown'), null);
});
