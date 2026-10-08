import * as mod from 'node-sql-parser/build/bigquery';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('bigquery', mod);
