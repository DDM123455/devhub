import * as mod from 'node-sql-parser/build/athena';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('athena', mod);
