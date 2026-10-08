import * as mod from 'node-sql-parser/build/redshift';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('redshift', mod);
