import * as mod from 'node-sql-parser/build/flinksql';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('flinksql', mod);
