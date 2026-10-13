import type { ComponentType, SVGProps } from 'react';
import type { Permission } from '@/api/types';
import {
  IconAudit,
  IconDatasources,
  IconHome,
  IconInbox,
  IconModels,
  IconNodes,
  IconOntology,
  IconRetrieval,
  IconRuns,
  IconSettings,
  IconTenants,
  IconTools,
  IconUsage,
  IconUsers,
} from '../ui/icons';

export type NavTo =
  | '/'
  | '/tenants'
  | '/models'
  | '/datasources'
  | '/ontology'
  | '/nodes'
  | '/runs'
  | '/inbox'
  | '/tools'
  | '/rag'
  | '/usage'
  | '/audit'
  | '/users'
  | '/settings';

export interface NavItem {
  to: NavTo;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Shown to users who hold it deployment-wide or on some workspace. */
  perm?: Permission;
  /** Old names, for the command palette. */
  also?: readonly string[];
}

/**
 * The target navigation of the UX audit: daily work first, in the domain
 * owner's words, and the installation pages in a collapsible Administration
 * group. Routes keep their old paths, so deep links still work.
 */
export const DAILY_NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome, also: ['overview', 'dashboard', 'setup'] },
  { to: '/inbox', label: 'Approvals', icon: IconInbox, perm: 'runs.read', also: ['inbox'] },
  { to: '/nodes', label: 'Assistants', icon: IconNodes, perm: 'nodes.read', also: ['nodes'] },
  { to: '/runs', label: 'Conversations', icon: IconRuns, perm: 'runs.read', also: ['runs'] },
  {
    to: '/rag',
    label: 'Knowledge',
    icon: IconRetrieval,
    perm: 'rag.read',
    also: ['retrieval', 'rag', 'documents', 'collections'],
  },
  {
    to: '/usage',
    label: 'Usage and costs',
    icon: IconUsage,
    perm: 'usage.read',
    also: ['usage', 'reports', 'spend', 'billing'],
  },
];

export const ADMIN_NAV: readonly NavItem[] = [
  {
    to: '/tenants',
    label: 'Workspaces',
    icon: IconTenants,
    perm: 'tenant.read',
    also: ['tenants', 'privacy', 'api keys', 'topics', 'intents'],
  },
  { to: '/models', label: 'Models', icon: IconModels, perm: 'catalog.read', also: ['catalogue'] },
  {
    to: '/datasources',
    label: 'Data connections',
    icon: IconDatasources,
    perm: 'datasources.read',
    also: ['datasources', 'databases', 'introspect', 'scan'],
  },
  {
    to: '/ontology',
    label: 'Data dictionary',
    icon: IconOntology,
    perm: 'ontology.read',
    also: ['ontology', 'semantic model'],
  },
  {
    to: '/tools',
    label: 'Connected systems',
    icon: IconTools,
    perm: 'tools.read',
    also: ['tools', 'mcp', 'tool servers'],
  },
  {
    to: '/users',
    label: 'People and roles',
    icon: IconUsers,
    perm: 'rbac.read',
    also: ['users', 'roles', 'rbac'],
  },
  { to: '/audit', label: 'Audit log', icon: IconAudit, perm: 'audit.read', also: ['audit'] },
  {
    to: '/settings',
    label: 'Developer',
    icon: IconSettings,
    also: ['settings', 'sdk', 'endpoints', 'snippets'],
  },
];
