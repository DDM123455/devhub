import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Test the static output with its deployed headers, including worker-specific overrides.
export async function previewDist() {
	const root = path.resolve('dist');
	const headers = await readFile(path.join(root, '_headers'), 'utf8');
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
	const server = createServer(async (req, res) => {
		try {
			const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
			const file = path.resolve(root, '.' + route + (route.endsWith('/') ? 'index.html' : ''));
			if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
			const bytes = await readFile(file);
			let matches = false;
			for (const line of headers.split(/\r?\n/)) {
				if (line.startsWith('/')) {
					matches = line.endsWith('*') ? route.startsWith(line.slice(0, -1)) : line === route;
				} else if (matches && /^\s+\S/.test(line)) {
					const header = line.trim();
					if (header.startsWith('! ')) res.removeHeader(header.slice(2));
					else {
						const colon = header.indexOf(':');
						res.appendHeader(header.slice(0, colon), header.slice(colon + 1).trim());
					}
				}
			}
			res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
			res.end(bytes);
		} catch {
			res.writeHead(404).end();
		}
	});
	await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
	return { server, url: 'http://127.0.0.1:' + server.address().port };
}
