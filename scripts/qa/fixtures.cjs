const { PDFDocument } = require('pdf-lib');

const file = (name, mimeType, buffer) => ({ name, mimeType, buffer: Buffer.from(buffer) });

async function makeFixtures(browser, directory) {
	const doc = await PDFDocument.create();
	doc.addPage([120, 150]);
	doc.addPage([160, 130]);
	const pdf = file('two.pdf', 'application/pdf', await doc.save());
	const context = await browser.newContext({ recordVideo: { dir: directory, size: { width: 160, height: 120 } } });
	const page = await context.newPage();
	await page.setContent('<body style="background:white">Local test clip</body>');
	const images = await page.evaluate(() => [[640, 120], [1, 6000]].map(([width, height]) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, width, height);
		ctx.fillStyle = 'black';
		ctx.font = '48px Arial';
		ctx.fillText('LOCAL TEST 42', 20, 80);
		return canvas.toDataURL('image/png').split(',')[1];
	}));
	await page.waitForTimeout(1500); // Make a measurable video segment.
	const video = page.video();
	await context.close();
	const wav = Buffer.alloc(44 + 16000);
	wav.write('RIFF');
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8000, 24);
	wav.writeUInt32LE(16000, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(16000, 40);
	return {
		pdf, video: await video.path(), audio: file('silent.wav', 'audio/wav', wav),
		image: file('sample.png', 'image/png', Buffer.from(images[0], 'base64')),
		thin: file('thin.png', 'image/png', Buffer.from(images[1], 'base64')),
		bad: file('bad.txt', 'text/plain', 'unsupported fixture'),
	};
}

module.exports = { makeFixtures };
