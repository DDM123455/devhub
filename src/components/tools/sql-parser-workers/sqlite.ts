import * as mod from 'node-sql-parser/build/sqlite';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('sqlite', mod);
