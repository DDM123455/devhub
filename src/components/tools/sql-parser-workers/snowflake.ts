import * as mod from 'node-sql-parser/build/snowflake';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('snowflake', mod);
