import { installFormatWorker } from './formatWorkerCore';
import * as typescript from 'prettier/plugins/typescript';
import * as estree from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';

// TypeScript / TSX: prettier + typescript + estree.
installFormatWorker({ prettier: async () => prettier, plugins: { typescript: async () => typescript, estree: async () => estree } });
