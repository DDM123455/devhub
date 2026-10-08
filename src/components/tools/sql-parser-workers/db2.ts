import * as mod from 'node-sql-parser/build/db2';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('db2', mod);
