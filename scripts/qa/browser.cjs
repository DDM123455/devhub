// Build first. Requires Playwright with Chromium installed in the QA environment.
// node scripts/qa/browser.cjs [tool-slug ...]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { makeFixtures } = require('./fixtures.cjs');
const flows = { ...require('./text-flows.cjs'), ...require('./file-flows.cjs') };

async function kitchen(page, url) {
	const pairs = await fs.readdir('dist/en/convert', { withFileTypes: true });
	for (const pair of pairs.filter(entry => entry.isDirectory())) {
		await page.goto(url + '/en/convert/' + pair.name + '/');
		const root = page.locator('main astro-island:not([ssr])');
		const amount = root.locator('input[type=number]');
		const output = root.locator('output');
		for (const value of ['', '-1', '0']) {
			await amount.fill(value);
			assert.equal(await output.innerText(), value === '0' ? '0' : '—', pair.name);
		}
		await amount.fill('3');
		const first = await output.innerText();
		assert.ok(Number(first) > 0);
		await root.getByRole('button').click();
		assert.notEqual(await output.innerText(), first);
		await root.getByRole('button').click();
		assert.equal(await output.innerText(), first);
		if (pair.name === 'tsp-to-grams') {
			await root.locator('select').selectOption('flour');
			assert.notEqual(await output.innerText(), first);
		}
		if (pair.name === 'tsp-to-ml') {
			await amount.fill('1e308');
			assert.equal(await output.innerText(), '—');
			await amount.fill('0.00001');
			assert.equal(await output.innerText(), '0.0000493');
		}
	}
}

async function home(page, url) {
	await page.goto(url + '/en/');
	const search = page.locator('#tool-search');
	await search.fill('base64');
	await page.locator('main a:visible[href*="/base64-"]').first().waitFor();
	await search.fill('zzzz-no-such-tool-zzzz');
	assert.equal(await page.locator('main a:visible[href*="/base64-"]').count(), 0);
	await search.fill('');
	await page.locator('main a:visible[href*="/base64-"]').first().waitFor();
	const isDark = () => page.locator('html').evaluate(el => el.classList.contains('dark'));
	const before = await isDark();
	await page.locator('#theme-toggle').click();
	assert.notEqual(await isDark(), before);
	await page.reload();
	assert.notEqual(await isDark(), before);
	await page.locator('#lang-switcher summary').click();
	await page.locator('#lang-switcher a[href="/vi/"]').click();
	assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
}

async function main() {
	const { previewDist } = await import('./preview.mjs');
	const selected = process.argv.slice(2);
	const all = await fs.readdir('dist/en/tools', { withFileTypes: true });
	assert.deepEqual(Object.keys(flows).sort(), all.filter(x => x.isDirectory()).map(x => x.name).sort());
	const names = selected.length ? selected : [...Object.keys(flows), 'kitchen', 'home'];
	const actions = {};
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-browser-qa-'));
	const { server, url } = await previewDist();
	let browser;
	try {
		browser = await chromium.launch();
		const fixture = await makeFixtures(browser, dir);
		for (const name of names) {
			const viewport = process.env.QA_DESKTOP ? { width: 1366, height: 900 } : { width: 390, height: 844 };
			const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
			const page = await context.newPage();
			if (process.env.QA_ACTION_LOG) {
				const recorded = new Set();
				await page.exposeFunction('recordQaAction', label => recorded.add(label));
				await page.addInitScript(() => {
					document.addEventListener('click', event => {
						const el = event.target.closest?.('button,summary,a[download],input[type=checkbox],input[type=radio]');
						if (el) window.recordQaAction((el.ariaLabel || el.title || el.textContent || el.id || el.type).trim());
					}, true);
				});
				actions[name] = recorded;
			}
			page.setDefaultTimeout(10000);
			page.on('dialog', dialog => dialog.accept());
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			try {
				if (name === 'home') await home(page, url);
				else if (name === 'kitchen') await kitchen(page, url);
				else {
					const response = await page.goto(url + '/en/tools/' + name + '/');
					assert.equal(response.status(), 200);
					const csp = response.headers()['content-security-policy'];
					assert.doesNotMatch(csp.match(/connect-src[^;]+/)[0], /blob:/);
					const root = page.locator('main astro-island').first();
					await root.scrollIntoViewIfNeeded();
					await page.waitForFunction(() => document.querySelector('main astro-island:not([ssr])'));
					const input = root.locator('textarea:visible').first();
					const button = label => root.getByRole('button', { name: label, exact: typeof label === 'string' }).first();
					const click = label => button(label).click();
					const contains = text => root.getByText(text, {exact: typeof text === 'string'}).first().waitFor();
					const selectFile = file => root.locator('input[type=file]').first().setInputFiles(file);
					async function rejectsFile(message = /file.s?.*(skipped|unsupported)/i) {
						await selectFile(fixture.bad);
						await contains(message);
					}
					async function download(label, timeout = 20000) {
						const target = button(label);
						await target.waitFor({timeout});
						const [download] = await Promise.all([page.waitForEvent('download', {timeout}), target.click({timeout})]);
						assert.equal(await download.failure(), null);
						const bytes = await fs.readFile(await download.path());
						assert.ok(bytes.length > 0, download.suggestedFilename());
						return bytes;
					}
					await flows[name]({ root, input, page, button, click, contains, selectFile, rejectsFile, download, fixture, url });
				}
				assert.deepEqual(errors, []);
				assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
				console.log('PASS', name);
			} catch (error) {
				process.exitCode = 1;
				console.error('FAIL', name, error.message, errors);
			} finally {
				await context.close();
			}
		}
	} finally {
		if (process.env.QA_ACTION_LOG) {
			await fs.writeFile(process.env.QA_ACTION_LOG, JSON.stringify(actions, (_, value) => value instanceof Set ? [...value].sort() : value, 2));
		}
		await browser?.close();
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
		await fs.rm(dir, { recursive: true, force: true });
	}
}

main().catch(error => { console.error(error); process.exitCode = 1; });
