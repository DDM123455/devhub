import { installFormatWorker } from './formatWorkerCore';
import * as graphql from 'prettier/plugins/graphql';
import * as prettier from 'prettier/standalone';

// GraphQL: prettier + graphql.
installFormatWorker({ prettier: async () => prettier, plugins: { graphql: async () => graphql } });
