import { installFormatWorker } from './formatWorkerCore';
import * as markdown from 'prettier/plugins/markdown';
import * as yaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';

// Markdown (+ YAML front matter). Fenced code blocks are left as written.
installFormatWorker({ prettier: async () => prettier, plugins: { markdown: async () => markdown, yaml: async () => yaml } });
