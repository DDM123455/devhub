import * as mod from 'node-sql-parser/build/mariadb';
import { setupParserWorker } from '../sqlParserWorkerCore';

setupParserWorker('mariadb', mod);
