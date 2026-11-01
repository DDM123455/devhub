import { useEffect } from 'react';

/**
 * While `active` (a long conversion is running), ask the browser to confirm before the tab is closed or reloaded:
 * the work happens only in this tab, so leaving silently throws it away. The text of the dialog is browser-controlled.
 */
export function useLeaveWarning(active: boolean): void {
	useEffect(() => {
		if (!active) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [active]);
}
