import * as mod from 'node-sql-parser/build/transactsql';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('transactsql', mod);
