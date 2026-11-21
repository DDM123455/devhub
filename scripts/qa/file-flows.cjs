const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');

// Decode the actual downloaded file independently of the tool's result panel.
async function dimensions(page, bytes, type) {
	return page.evaluate(async ({ bytes, type }) => {
		const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type }));
		const result = [bitmap.width, bitmap.height];
		bitmap.close();
		return result;
	}, { bytes: bytes.toString('base64'), type });
}

module.exports = {
	async 'compress-image'({ page, selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile();
		await selectFile(fixture.image);
		await click('Compress');
		assert.deepEqual(await dimensions(page, await download('Download'), 'image/png'), [640, 120]);
		await click('Clear all');
	},
	async 'convert-image-format'({ page, root, selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile();
		await selectFile(fixture.thin);
		await root.getByRole('checkbox').first().check();
		await click('Convert');
		assert.deepEqual(await dimensions(page, await download('Download'), 'image/webp'), [1, 1920]);
		for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/x-icon']) {
			await root.locator('select').first().selectOption(type);
			await click('Convert');
			const bytes = await download('Download');
			if (type === 'image/x-icon') {
				assert.equal(bytes.readUInt16LE(2), 1);
				assert.equal(bytes.readUInt16LE(4), 5);
			} else {
				assert.deepEqual(await dimensions(page, bytes, type), [1, 1920]);
			}
		}
		await root.locator('select').first().selectOption('image/avif');
		await click('Convert');
		const avifError = root.getByRole('alert');
		await avifError.or(root.getByRole('button', { name: 'Download', exact: true })).first().waitFor();
		if (await avifError.count()) assert.match(await avifError.first().innerText(), /can't encode AVIF/);
		else assert.deepEqual(await dimensions(page, await download('Download'), 'image/avif'), [1, 1920]);
		await root.locator('select').first().selectOption('application/pdf');
		await click('Convert');
		assert.equal((await PDFDocument.load(await download('Download'))).getPageCount(), 1);
	},
	async 'merge-pdf'({ selectFile, rejectsFile, click, download, fixture, button }) {
		await rejectsFile();
		await selectFile([fixture.pdf, fixture.image]);
		await button('Rotate page 3').waitFor();
		assert.ok(await button('Move earlier 1').isDisabled());
		await click('Move earlier 2');
		await click('Move later 1');
		await click('Rotate page 1');
		await click('Merge PDFs');
		const pages = (await PDFDocument.load(await download(/Download merged/i))).getPages();
		assert.equal(pages.length, 3);
		assert.equal(pages[0].getRotation().angle, 90);
	},
	async 'split-pdf'({ selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile(/wrong reading|supported|select a PDF/i);
		await selectFile(fixture.pdf);
		await click('Split PDF');
		const zip = await JSZip.loadAsync(await download(/Download All/));
		const entries = zip.file(/\.pdf$/i);
		assert.equal(entries.length, 2);
		for (const entry of entries) assert.equal((await PDFDocument.load(await entry.async('uint8array'))).getPageCount(), 1);
	},
	async 'image-to-text'({ root, button, selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile();
		await selectFile(fixture.image);
		await click(/^Extract text/);
		assert.match((await download('Download .txt', 120000)).toString(), /LOCAL TEST 42/);
		const docx = await JSZip.loadAsync(await download('Download .docx'));
		assert.match(await docx.file('word/document.xml').async('string'), /LOCAL TEST 42/);
		assert.ok(await button('Remove English').isDisabled());
		await root.locator('section[aria-labelledby="ocr-lang-label"] select').selectOption('vie');
		await click('Remove English');
		assert.ok(await button('Remove Vietnamese').isDisabled());
	},
	async 'remove-background'({ root, page, selectFile, rejectsFile, click, download, fixture, url }) {
		const entry = page.waitForResponse(r => r.url().startsWith(url + '/_astro/backgroundRemovalWorker-'));
		await rejectsFile();
		const metadata = 'https://staticimgly.com/**/resources.json';
		await page.context().route(metadata, route => route.abort('internetdisconnected'));
		await selectFile(fixture.image);
		const policy = (await entry).headers()['content-security-policy'];
		assert.match(policy, /connect-src[^;]*blob:/);
		assert.doesNotMatch(policy, /'unsafe-eval'/);
		await root.getByRole('button', { name: 'Retry', exact: true }).waitFor({ timeout: 20000 });
		await page.context().unroute(metadata);
		await click('Retry');
		const result = await download('Download', 180000);
		assert.deepEqual(await dimensions(page, result, 'image/png'), [640, 120]);
		await click('Solid color');
		await click('Edit mask');
		await root.getByRole('button', {name:/cancel/i}).first().click();
		await root.getByRole('button', {name: 'Remove ' + fixture.image.name, exact:true}).click();
		assert.equal(await root.getByRole('button', {name:'Download',exact:true}).count(), 0);
		await selectFile(fixture.image);
		await root.getByRole('button', {name:'Download',exact:true}).waitFor({timeout:180000});
		await click('Clear all');
		assert.equal(await root.getByRole('button', {name:'Download',exact:true}).count(), 0);
	},
	async 'video-trimmer'({ selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile(/video file|video format/i);
		await selectFile(fixture.video);
		await click('Forward 1 frame');
		await click('Back 1 frame');
		await click('Trim video');
		const clip = await download('Download', 120000);
		assert.equal(clip.subarray(0, 4).toString('hex'), '1a45dfa3');
	},
	async 'mp3-wav-converter'({ selectFile, rejectsFile, click, download, fixture }) {
		await rejectsFile();
		await selectFile(fixture.audio);
		await click('Convert');
		const audio = await download('Download', 90000);
		assert.ok(audio.length > 100);
		assert.ok(audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 255 && (audio[1] & 224) === 224));
		await click('Choose a different file');
	},
};
