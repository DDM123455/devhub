// All loaders, each a dynamic import() so the bundler emits one lazy chunk per library.
// Used by the main-thread fallback (no Worker support) and by the unit tests. The workers do
// NOT use this file: each worker entry wires up only its own language group.
import type { FormatLoaders } from './format-run';

export const allLoaders: FormatLoaders = {
	prettier: () => import('prettier/standalone'),
	plugins: {
		babel: () => import('prettier/plugins/babel'),
		estree: () => import('prettier/plugins/estree'),
		typescript: () => import('prettier/plugins/typescript'),
		postcss: () => import('prettier/plugins/postcss'),
		html: () => import('prettier/plugins/html'),
		markdown: () => import('prettier/plugins/markdown'),
		yaml: () => import('prettier/plugins/yaml'),
		graphql: () => import('prettier/plugins/graphql'),
	},
	sql: () => import('sql-formatter'),
};
