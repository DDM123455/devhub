import { useCallback, useEffect, useRef, useState } from 'react';

// Shared clipboard hook: handles the rejected-promise case (insecure context, denied
// permission, unfocused document) that a bare `navigator.clipboard.writeText(...)` ignores,
// resets the "copied" flag after a delay, and cleans its timer up on unmount.
export function useCopyToClipboard(resetMs = 1500) {
	const [copied, setCopied] = useState(false);
	const [failed, setFailed] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	const copy = useCallback(
		async (text: string): Promise<boolean> => {
			if (timerRef.current) clearTimeout(timerRef.current);
			let ok = true;
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setFailed(false);
			} catch {
				setCopied(false);
				setFailed(true);
				ok = false;
			}
			timerRef.current = setTimeout(() => {
				setCopied(false);
				setFailed(false);
			}, resetMs);
			return ok;
		},
		[resetMs],
	);

	return { copied, failed, copy };
}
