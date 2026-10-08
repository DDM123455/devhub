import { installFormatWorker } from './formatWorkerCore';
import * as yaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';

// YAML: prettier + yaml.
installFormatWorker({ prettier: async () => prettier, plugins: { yaml: async () => yaml } });
