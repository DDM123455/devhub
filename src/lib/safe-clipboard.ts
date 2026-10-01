/** Copies text; resolves false (never rejects) when the Clipboard API is unavailable or denied. */
export async function copyTextSafe(text: string): Promise<boolean> {
	try {
		if (!navigator.clipboard?.writeText) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
