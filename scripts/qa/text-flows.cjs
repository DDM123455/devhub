const assert = require('node:assert/strict');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');

module.exports = {
	async 'base64-encoder-decoder'({ input, root, click, contains, fixture, download }) {
		await click('Decode');
		await input.fill('%%%');
		await contains(/Not valid Base64/);
		await input.fill(Buffer.from('Đà Nẵng 👋').toString('base64'));
		assert.equal(await root.locator('textarea').last().inputValue(), 'Đà Nẵng 👋');
		await input.fill(fixture.image.buffer.toString('base64'));
		assert.deepEqual(await download(/Download the decoded file/i), fixture.image.buffer);
		await click('Clear');
		assert.equal(await input.inputValue(), '');
		await click('Encodings & gzip');
		await root.locator('#b64-conv-from').selectOption('text');
		await root.locator('#b64-conv-to').selectOption('hex');
		await root.locator('#b64-conv-input').fill('A');
		assert.equal(await root.locator('#b64-conv-output').inputValue(), '41');
		await click('Compress');
		await root.locator('#b64-zip-input').fill('Xin chào 👋');
		await click('Run');
		const zipped = root.locator('#b64-zip-output');
		await root.getByRole('status').last().waitFor();
		const encoded = await zipped.inputValue();
		assert.equal(require('node:zlib').gunzipSync(Buffer.from(encoded, 'base64')).toString(), 'Xin chào 👋');
		await click('Decompress');
		await root.locator('#b64-zip-input').fill(encoded);
		await click('Run');
		await root.getByRole('status').last().waitFor();
		assert.equal(await zipped.inputValue(), 'Xin chào 👋');
		await root.locator('#b64-zip-input').fill('%%%');
		assert.equal(await zipped.inputValue(), '');
		await click('Run');
		await root.getByRole('alert').last().waitFor();
	},
	async 'code-formatter'({ input, contains, click, download }) {
		await input.fill('{"x":');
		await click(/^Format\b/);
		await contains(/Could not format as JSON/);
		await input.fill('{"x":"Đà Nẵng","n":0}');
		await click(/^Format\b/);
		assert.deepEqual(JSON.parse(await download(/Download .json/)), { x: 'Đà Nẵng', n: 0 });
	},
	async 'color-picker'({ root, click, contains, page }) {
		const hex = root.locator('input[type=text],input:not([type])').first();
		await hex.fill('#ZZ');
		await hex.press('Tab');
		await contains(/Enter a valid hex/);
		await hex.fill('#abc');
		await hex.press('Tab');
		await click('Copy HEX');
		assert.equal((await page.evaluate(() => navigator.clipboard.readText())).toUpperCase(), '#AABBCC');
		await page.evaluate(() => {
			let cancelled = true;
			window.EyeDropper = class {
				async open() {
					if (cancelled) {
						cancelled = false;
						throw new DOMException('Cancelled', 'AbortError');
					}
					return { sRGBHex: '#123456' };
				}
			};
		});
		const before = await hex.inputValue();
		await click('Pick color from screen');
		assert.equal(await hex.inputValue(), before);
		await click('Pick color from screen');
		await click('Copy HEX');
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '#123456');
		await root.getByRole('tab', { name: 'Contrast' }).click();
		await contains(/WCAG/);
		await root.getByRole('tab', { name: 'Palettes' }).click();
	},
	async 'csv-json-converter'({ root, input, contains, click, download }) {
		await input.fill('"unclosed');
		await contains(/unterminated/i);
		await input.fill('name,city\n"Ada, K.",Hà Nội');
		const actual = JSON.parse(await download('Download'));
		assert.deepEqual(actual, [{ name: 'Ada, K.', city: 'Hà Nội' }]);
		await click('Swap input/output');
		assert.match(await root.locator('textarea').last().inputValue(), /"Ada, K."/);
	},
	async 'iso-validator'({ page, input, contains, click, download }) {
		await click('Load sample');
		await contains(/ISO 8583:1987/);
		assert.match((await download('Download CSV')).toString(), /0200/);
		await input.fill('not an iso code');
		await contains('Not recognized (1)');
		await input.fill('GB82 WEST 1234 5698 7654 32');
		await contains('Valid (1)');
		const lookup = page.locator('section[aria-labelledby="iso8583-lookup-heading"]');
		const search = lookup.getByRole('searchbox');
		await search.fill('00');
		await lookup.getByRole('cell', {name: /approved/i}).first().waitFor();
		await lookup.getByRole('tab', {name: /Data elements/}).click();
		await search.fill('DE39');
		await lookup.getByRole('cell', {name: /Response code/i}).first().waitFor();
		await lookup.getByRole('tab', {name: /Merchant category/}).click();
		await search.fill('5411');
		await lookup.getByRole('cell', {name: /grocery/i}).first().waitFor();
		await search.fill('no-such-category');
		await lookup.getByText('Nothing matches that search.').waitFor();
	},
	async 'json-formatter'({ root, input, click, download, contains }) {
		const editor = root.locator('textarea.jsoneditor-text');
		await editor.fill('{"city":"Hue","currency":"VND"}');
		await root.getByTitle('Switch Editor Mode').click();
		await root.getByTitle('Switch to tree editor').click();
		const fields = root.locator('.jsoneditor-tree div.jsoneditor-field');
		assert.equal(await fields.count(), 2);
		for (const [action, expected] of [[/^Duplicate this field/, 3], [/^Remove this field/, 2], [/^Insert a new field/, 3]]) {
			await root.locator('.jsoneditor-contextmenu-button').nth(1).click();
			await root.getByTitle(action).click();
			assert.equal(await fields.count(), expected);
		}
		await root.getByTitle('Switch Editor Mode').click();
		await root.getByTitle('Switch to plain text editor').click();
		await click('Format');
		await click('XML');
		await input.fill('<root><a></root>');
		await click('Validate XML');
		await root.getByRole('alert').waitFor();
		await input.fill('<root><a> x </a></root>');
		await click('Format XML');
		await click('Tree');
		await click(/Expand all/);
		await click(/Collapse all/);
		await click('Text');
		await click('Minify');
		assert.equal((await download('Download XML')).toString(), '<root><a> x </a></root>');
		await click('Clear');
		assert.equal(await input.inputValue(), '');
	},
	async 'json-to-excel-converter'({ input, contains, click, download }) {
		await input.fill('[{"x":');
		await contains(/Invalid JSON/);
		await click('Load sample data');
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(await download('Download .xlsx'));
		assert.deepEqual(workbook.worksheets.map(s => s.name), ['employees', 'departments']);
		assert.match(JSON.stringify(workbook.worksheets[0].getSheetValues()), /Ada Lovelace/);
	},
	async 'jwt-decoder'({ root, input, click, contains }) {
		await input.fill('a.b.c');
		await contains(/Couldn't decode/);
		await click('Load sample token');
		await contains(/John Doe/);
		await root.locator('input[type=password]').last().fill('local-fixture-signing-key-at-least-32-bytes');
		await click('Set iat / exp now');
		await click('Sign token');
		const output = root.locator('textarea[readonly]').last();
		await output.waitFor();
		assert.equal((await output.inputValue()).split('.').length, 3);
	},
	async 'kubernetes-yaml-validator'({ input, click, contains, download }) {
		await input.fill('kind: [');
		await contains(/YAML syntax error/);
		await click('Load sample');
		const report = JSON.parse(await download(/Download JSON report/));
		assert.match(JSON.stringify(report), /Deployment|Service/);
		await click('Clear');
		assert.equal(await input.inputValue(), '');
	},
	async 'markdown-editor'({ page, root, click, button, download }) {
		await click('Load sample');
		assert.match((await download('Download .md')).toString(), /#/);
		const editor = root.locator('[contenteditable=true]').first();
		await editor.fill('# Local QA\n\n**Xin chào**');
		assert.match((await download('Download .html')).toString(), /<strong>Xin chào<\/strong>/);
		await root.getByTitle(/Opens your browser's print dialog/).click();
		const printArticle = page.frameLocator('iframe[aria-hidden=true]').locator('article.md-print strong');
		assert.equal(await printArticle.textContent(), 'Xin chào');
		await click('Clear');
		assert.ok(await button('Download .md').isDisabled());
	},
	async 'nginx-config-validator'({ input, click, contains, download }) {
		await input.fill('http {');
		await contains(/1 errors/);
		await click('Load sample');
		await contains(/0 errors/);
		assert.ok(JSON.parse(await download(/Download JSON report/)));
		await click('Clear');
		assert.equal(await input.inputValue(), '');
	},
	async 'qr-code-generator'({ root, button, download }) {
		const input = root.locator('input[type=text]').first();
		await input.fill('');
		assert.ok(await button('Download PNG').isDisabled());
		await input.fill('https://example.com/local');
		assert.equal((await download('Download PNG')).subarray(1, 4).toString(), 'PNG');
		assert.match((await download('Download SVG')).toString(), /<svg\b/);
		assert.equal((await download('Download JPEG')).readUInt16BE(0), 0xffd8);
		assert.equal((await download('Download PDF')).subarray(0, 5).toString(), '%PDF-');
	},
	async 'regex-tester'({ root, click, contains }) {
		await click('Load sample');
		await contains(/3 matches/);
		const pattern = root.locator('input[type=text]').first();
		await pattern.fill('(');
		await contains(/Invalid pattern/);
		await pattern.fill('^');
		await contains(/Match 1/);
		await click(/Clear pattern/);
		assert.equal(await pattern.inputValue(), '');
	},
	async 'sql-formatter'({ input, click, contains, download }) {
		await input.fill('SELECT (');
		await click('Check syntax');
		await contains(/have syntax errors/);
		await input.fill("select 'xin chào' as label");
		await click(/^Format\b/);
		await contains(/Valid syntax/);
		assert.match((await download(/Download .sql/)).toString(), /'xin chào'/);
	},
	async 'sql-java-converter'({ input, click, contains, download }) {
		await input.fill('CREATE TABLE');
		await click('Parse & convert');
		await contains(/No output/);
		await click('Load sample');
		await click('Replace');
		await click('Parse & convert');
		const zip = await JSZip.loadAsync(await download(/Download ZIP/));
		assert.ok(zip.file(/\.java$/).length > 0);
		assert.ok(zip.file(/schema-metadata\.json$/).length > 0);
	},
	async 'svg-optimizer'({ root, input, click, download }) {
		await input.fill('<svg><');
		await root.getByRole('alert').first().waitFor();
		await click('Load sample');
		await click('Compare');
		await click('Code');
		assert.match((await download('Download')).toString(), /<svg\b/);
	},
	async 'text-case-converter'({ input, click, button, contains, download }) {
		assert.ok(await button('Copy').isDisabled());
		await input.fill('Đà Nẵng 😀\nhello 42');
		await contains('18 characters · 4 words');
		await click('lowercase');
		assert.equal((await download('Download .txt')).toString(), 'đà nẵng 😀\nhello 42');
		await click('Clear');
		assert.ok(await button('Copy').isDisabled());
	},
	async 'text-diff-checker'({ page, root, click, contains }) {
		const left = root.getByRole('textbox', { name: 'Original text', exact: true });
		const right = root.getByRole('textbox', { name: 'Changed text', exact: true });
		await left.fill('F39=00' + ' '.repeat(30) + 'F41=TERM0001    F49=704');
		await right.fill('F39=05    F41=TERM0001' + ' '.repeat(30) + 'F49=840');
		await right.press('Control+Enter');
		await contains(/Differences found/);
		for (const mode of ['Character', 'Word']) {
			await click(mode);
			const highlights = root.locator('#text-diff-results span[class*="bg-orange-400"]');
			await highlights.first().waitFor();
			const marked = await highlights.allTextContents();
			assert.ok(marked.some(x => /[0-9]/.test(x)));
			assert.ok(marked.every(x => !x.includes('TERM')));
		}
		await right.fill(await left.inputValue());
		await right.press('Control+Enter');
		await contains(/identical|no differences/i);
		const log = Array.from({ length: 2000 }, (_, i) => 'left ' + i);
		async function pasteLines(field, lines) {
			await page.evaluate(text => navigator.clipboard.writeText(text), lines.join('\n'));
			await field.press('Control+a');
			await field.press('Control+v');
		}
		await pasteLines(left, log);
		await pasteLines(right, log.map((_, i) => 'right ' + i));
		await right.press('Control+Enter');
		await contains('Modified lines: 2000');
		await pasteLines(right, log.toReversed());
		await right.press('Control+Enter');
		await contains('Removed lines: 1999');
		await contains('Added lines: 1999');
	},
	async 'word-counter'({ input, click, button, contains, download }) {
		assert.ok(await button('Copy').isDisabled());
		await input.fill('Đà Nẵng 😀\nhello 42');
		assert.equal((await download('Download .txt')).toString(), await input.inputValue());
		await contains('25.0%');
		await click('Clear');
		assert.equal(await input.inputValue(), '');
	},
};
