const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'ogv', '3gp', 'ts', 'mts', 'm2ts', 'flv', 'wmv', 'mpg', 'mpeg']);

const VIDEO_MIME_TO_EXT: Record<string, string> = {
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'video/x-matroska': 'mkv',
	'video/x-msvideo': 'avi',
	'video/ogg': 'ogv',
	'video/3gpp': '3gp',
	'video/mp2t': 'ts',
	'video/x-flv': 'flv',
	'video/x-ms-wmv': 'wmv',
	'video/mpeg': 'mpg',
};

export function extOfName(name: string): string {
	const i = name.lastIndexOf('.');
	if (i <= 0 || i === name.length - 1) return '';
	return name.slice(i + 1).toLowerCase();
}

/** File có vẻ là video (theo MIME hoặc đuôi trong whitelist). */
export function isVideoFile(file: { name: string; type: string }): boolean {
	return file.type.startsWith('video/') || VIDEO_EXTS.has(extOfName(file.name));
}

/**
 * Đuôi an toàn cho input/output của ffmpeg: ưu tiên đuôi trong whitelist, rồi suy từ MIME, cuối cùng 'mp4'.
 * Tránh đuôi lạ/độc hại (vd tên "a.b/../x") lọt vào tên file ảo của ffmpeg FS.
 */
export function safeVideoExt(file: { name: string; type: string }): string {
	const byName = extOfName(file.name);
	if (VIDEO_EXTS.has(byName)) return byName;
	return VIDEO_MIME_TO_EXT[file.type] ?? 'mp4';
}
