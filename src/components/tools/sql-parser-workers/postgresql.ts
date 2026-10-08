import * as mod from 'node-sql-parser/build/postgresql';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('postgresql', mod);
