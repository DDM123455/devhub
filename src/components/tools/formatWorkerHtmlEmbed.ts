import { installFormatWorker } from './formatWorkerCore';
import * as html from 'prettier/plugins/html';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import * as postcss from 'prettier/plugins/postcss';
import * as prettier from 'prettier/standalone';

// HTML with inline <script>/<style>: also formats the embedded JavaScript and CSS.
installFormatWorker({
	prettier: async () => prettier,
	plugins: { html: async () => html, babel: async () => babel, estree: async () => estree, postcss: async () => postcss },
});
