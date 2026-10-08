import * as mod from 'node-sql-parser/build/mysql';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('mysql', mod);
