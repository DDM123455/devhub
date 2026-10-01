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

const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'm4b', 'wma', 'aif', 'aiff', 'amr', 'weba', 'caf']);

/** File âm thanh (theo MIME hoặc đuôi trong whitelist). */
export function isAudioFile(file: { name: string; type: string }): boolean {
	return file.type.startsWith('audio/') || AUDIO_EXTS.has(extOfName(file.name));
}

/** Audio hoặc video (video được trích âm thanh ra). */
export function isAudioOrVideoFile(file: { name: string; type: string }): boolean {
	return isAudioFile(file) || isVideoFile(file);
}

/** Đuôi an toàn cho file vào của ffmpeg FS (audio/video whitelist, mặc định 'bin'). */
export function safeMediaExt(file: { name: string; type: string }): string {
	const byName = extOfName(file.name);
	if (AUDIO_EXTS.has(byName) || VIDEO_EXTS.has(byName)) return byName;
	if (file.type.startsWith('video/')) return safeVideoExt(file);
	return 'bin';
}
