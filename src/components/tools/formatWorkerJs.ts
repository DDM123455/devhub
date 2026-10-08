import { installFormatWorker } from './formatWorkerCore';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';

// JavaScript / JSX: prettier + babel + estree.
installFormatWorker({ prettier: async () => prettier, plugins: { babel: async () => babel, estree: async () => estree } });
