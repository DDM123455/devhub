import * as mod from 'node-sql-parser/build/trino';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('trino', mod);
