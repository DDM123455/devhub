import { installFormatWorker } from './formatWorkerCore';
import * as sqlFormatter from 'sql-formatter';

// SQL: sql-formatter only.
installFormatWorker({ sql: async () => sqlFormatter });
