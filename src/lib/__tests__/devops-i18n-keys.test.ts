import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { K8S_ISSUE_KEYS } from '../k8s-yaml-validator';
import { SECURITY_CHECK_IDS } from '../k8s-security';
import { NGINX_ISSUE_KEYS } from '../nginx-parser';

function load(lang: string, tool: string): { ui: { issues: Record<string, string>; security?: { checks: Record<string, string>; fixes: Record<string, string> } } } {
	return JSON.parse(readFileSync(resolve(__dirname, `../../i18n/locales/${lang}/tool-${tool}.json`), 'utf8'));
}

describe.each(['en', 'vi'])('i18n coverage (%s)', (lang) => {
	it('has a message for every Kubernetes issue key and security check', () => {
		const ui = load(lang, 'kubernetes-yaml-validator').ui;
		for (const key of K8S_ISSUE_KEYS) expect(ui.issues[key], key).toBeTruthy();
		for (const id of SECURITY_CHECK_IDS) {
			expect(ui.security?.checks[id], `check ${id}`).toBeTruthy();
			expect(ui.security?.fixes[id], `fix ${id}`).toBeTruthy();
		}
	});

	it('has a message for every nginx issue key', () => {
		const ui = load(lang, 'nginx-config-validator').ui;
		for (const key of NGINX_ISSUE_KEYS) expect(ui.issues[key], key).toBeTruthy();
	});
});
