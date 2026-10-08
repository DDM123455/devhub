import { installFormatWorker } from './formatWorkerCore';
import * as postcss from 'prettier/plugins/postcss';
import * as prettier from 'prettier/standalone';

// CSS / SCSS / LESS: prettier + postcss.
installFormatWorker({ prettier: async () => prettier, plugins: { postcss: async () => postcss } });
