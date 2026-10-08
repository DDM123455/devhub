import * as mod from 'node-sql-parser/build/hive';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('hive', mod);
