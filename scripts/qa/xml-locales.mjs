import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { tools } from '../../src/data/tools.ts';
import { previewDist } from './preview.mjs';

const { server, url } = await previewDist();
const engine = { chromium, firefox, webkit }[process.env.QA_BROWSER ?? 'chromium'];
assert.ok(engine, 'QA_BROWSER must be chromium, firefox or webkit');
const browser = await engine.launch();
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
		const sample = '<log><parsererror>first&#13;second</parsererror><parsererror xmlns="http://www.w3.org/1999/xhtml">detail</parsererror></log>';
		await input.fill(sample);
		await root.getByRole('button', { name: xml.format, exact: true }).click();
		const formatted = await root.locator('textarea[readonly]').inputValue();
		assert.equal(await page.evaluate(text => new DOMParser().parseFromString(text, 'application/xml')
			.documentElement.firstElementChild.textContent, formatted), 'first\rsecond');
		await root.getByRole('button', { name: xml.viewTree, exact: true }).click();
		await root.getByText('detail', { exact: false }).last().waitFor();
		await input.fill('\n\n<parsererror><broken></parsererror>');
		await validate.click();
		assert.ok((await root.getByRole('alert').innerText()).includes(xml.location
			.replace('{{line}}', '3').split('{{column}}')[0]));
		await input.fill('<?xml version="1.0"?><?xml-stylesheet href="example.css"?><!DOCTYPE root [<!-- ]> --><!ENTITY label "x > y">]><root>&label;</root>');
		await root.getByRole('button', { name: xml.minify, exact: true }).click();
		await root.getByRole('button', { name: xml.viewText, exact: true }).click();
		for (const action of [xml.format, xml.minify]) {
			await root.getByRole('button', { name: action, exact: true }).click();
			const result = await root.locator('textarea[readonly]').inputValue();
			assert.ok(result.startsWith('<?xml version="1.0"?>'));
			assert.ok(result.includes('<!DOCTYPE root [<!-- ]> --><!ENTITY label "x > y">]>'));
			assert.equal(result.split('<?xml-stylesheet').length - 1, 1);
		}
		await input.fill('<?xml-stylesheet href="example.css"?><root/>');
		await root.getByRole('button', { name: xml.format, exact: true }).click();
		assert.equal((await root.locator('textarea[readonly]').inputValue()).split('<?xml-stylesheet').length - 1, 1);
		console.log('PASS XML', locale);
	}
} finally {
	await browser.close();
	server.closeAllConnections();
	await new Promise(resolve => server.close(resolve));
}
