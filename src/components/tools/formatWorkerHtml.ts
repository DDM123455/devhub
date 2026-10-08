import { installFormatWorker } from './formatWorkerCore';
import * as html from 'prettier/plugins/html';
import * as prettier from 'prettier/standalone';

// HTML without inline <script>/<style>: prettier + html.
installFormatWorker({ prettier: async () => prettier, plugins: { html: async () => html } });
