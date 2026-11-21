// Run after npm run build and npx playwright install firefox webkit.
const assert = require('node:assert/strict');
const { firefox, webkit } = require('playwright');

async function testEngine(engine, url) {
	const browser = await engine.launch();
	try {
		const slugs = await require('node:fs/promises').readdir('dist/en/tools', { withFileTypes: true });
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		for (const { name: slug } of slugs.filter(entry => entry.isDirectory())) {
			const response = await page.goto(url + '/en/tools/' + slug + '/');
			assert.equal(response.status(), 200, slug);
			await page.locator('main astro-island').first().scrollIntoViewIfNeeded();
			await page.waitForSelector('main astro-island:not([ssr])', { state: 'attached' });
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), slug);
			if (slug === 'text-diff-checker') {
				await page.getByRole('textbox', {name:'Original text', exact:true}).fill('F39=00');
				const changed = page.getByRole('textbox', {name:'Changed text', exact:true});
				await changed.fill('F39=05');
				await changed.press('Control+Enter');
				await page.getByText('Modified lines: 1', {exact:true}).waitFor();
			}
			assert.deepEqual(errors, [], slug);
			console.log(engine.name(), slug);
		}
	} finally {
		await browser.close();
	}
}

(async () => {
	const { previewDist } = await import('./preview.mjs');
	const { server, url } = await previewDist();
	try {
		for (const engine of [firefox, webkit]) await testEngine(engine, url);
	} finally {
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
