import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { tools } from '../../src/data/tools.ts';
import { previewDist } from './preview.mjs';

const { server, url } = await previewDist();
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const formatter = tools.find(tool => tool.id === 'json-formatter');
	for (const [locale, slug] of Object.entries(formatter.slugs)) {
		const { xml } = JSON.parse(await readFile('src/i18n/locales/' + locale + '/tool-json-formatter.json', 'utf8'));
		await page.goto(url + '/' + locale + '/tools/' + slug + '/');
		const root = page.locator('main astro-island:not([ssr])').first();
		await root.getByRole('button', { name: 'XML', exact: true }).click();
		const input = root.locator('textarea:visible').first();
		await input.fill('<root/>');
		const validate = root.getByRole('button', {name: xml.validate, exact:true});
		await validate.click();
		await root.getByText(xml.valid, {exact:true}).waitFor();
		await input.fill('<root>');
		await validate.click();
		assert.ok(await root.getByRole('alert').textContent());
		console.log('PASS XML', locale);
	}
} finally {
	await browser.close();
	server.closeAllConnections();
	await new Promise(resolve => server.close(resolve));
}
