import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { compressToUrlSafeBase64 } from '@/lib/hash-share';
import { validateJsonSchema, type SchemaError } from '@/lib/json-schema-validate';
import {
	detectRepairIssues,
	generateCode,
	inferJsonSchema,
	JsonPathError,
	parseNdjson,
	queryJsonPath,
	type CodeLanguage,
	type RepairIssue,
} from '@/lib/json-tools';
import { useCopyToClipboard } from './useCopyToClipboard';

export interface JsonAdvancedMessages {
	heading: string;
	indentLabel: string;
	indent2: string;
	indent4: string;
	indentTab: string;
	format: string;
	minify: string;
	repair: string;
	share: string;
	shareCopied: string;
	shareFailed: string;
	shareNote: string;
	formatInvalid: string;
	repairedPrefix: string;
	repairedNone: string;
	repairedGeneric: string;
	repairFailed: string;
	issueCodeFence: string;
	issueComments: string;
	issueSingleQuotes: string;
	issueTrailingCommas: string;
	issueUnquotedKeys: string;
	issueConstants: string;
	issueNdjson: string;
	issueUnbalanced: string;
	codeHeading: string;
	codeLanguage: string;
	rootName: string;
	copy: string;
	copied: string;
	copyFailed: string;
	needValidJson: string;
	schemaHeading: string;
	schemaGenerate: string;
	schemaOutputLabel: string;
	validateHeading: string;
	schemaInputLabel: string;
	schemaInputPlaceholder: string;
	validateButton: string;
	validateOk: string;
	validateErrors: string;
	schemaInvalid: string;
	pathHeading: string;
	pathLabel: string;
	pathPlaceholder: string;
	pathRun: string;
	pathResults: string;
	pathNone: string;
	pathSyntax: string;
	pathHelp: string;
	pathsLabel: string;
	codeGenerate: string;
}

type Indent = '2' | '4' | 'tab';

const LANGUAGES: Array<{ value: CodeLanguage; label: string }> = [
	{ value: 'typescript', label: 'TypeScript (interface)' },
	{ value: 'go', label: 'Go (struct)' },
	{ value: 'java', label: 'Java (class)' },
	{ value: 'csharp', label: 'C# (class)' },
	{ value: 'python-dataclass', label: 'Python (dataclass)' },
	{ value: 'python-typeddict', label: 'Python (TypedDict)' },
];

function indentValue(indent: Indent): string | number {
	return indent === 'tab' ? '\t' : Number(indent);
}

function CopyButton({ text, messages }: { text: string; messages: JsonAdvancedMessages }) {
	const { copied, failed, copy } = useCopyToClipboard();
	return (
		<Button type="button" size="sm" variant="outline" aria-live="polite" disabled={!text} onClick={() => void copy(text)}>
			{copied ? messages.copied : failed ? messages.copyFailed : messages.copy}
		</Button>
	);
}

const fieldClass = 'min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground';
const areaClass = 'w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground';

export default function JsonAdvancedPanel({
	messages,
	getText,
	setText,
}: {
	messages: JsonAdvancedMessages;
	getText: () => string;
	setText: (text: string) => void;
}) {
	const [indent, setIndent] = useState<Indent>('2');
	const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

	const [language, setLanguage] = useState<CodeLanguage>('typescript');
	const [rootName, setRootName] = useState('Root');
	const [codeOutput, setCodeOutput] = useState<string | null>(null);
	const [codeError, setCodeError] = useState(false);

	const [schemaOutput, setSchemaOutput] = useState('');
	const [schemaInput, setSchemaInput] = useState('');
	const [validateResult, setValidateResult] = useState<{ errors: SchemaError[] } | { bad: true } | null>(null);

	const [pathQuery, setPathQuery] = useState('$..*');
	const [pathResult, setPathResult] = useState<{ matches: Array<{ path: string; value: unknown }> } | { error: string } | null>(null);

	const issueLabel = useMemo<Record<RepairIssue, string>>(
		() => ({
			codeFence: messages.issueCodeFence,
			comments: messages.issueComments,
			singleQuotes: messages.issueSingleQuotes,
			trailingCommas: messages.issueTrailingCommas,
			unquotedKeys: messages.issueUnquotedKeys,
			constants: messages.issueConstants,
			ndjson: messages.issueNdjson,
			unbalanced: messages.issueUnbalanced,
		}),
		[messages],
	);

	// Strict parse of the editor content, or null (and a status message) when invalid.
	const parseCurrent = (): { ok: true; value: unknown } | { ok: false } => {
		try {
			return { ok: true, value: JSON.parse(getText()) };
		} catch {
			return { ok: false };
		}
	};

	const handleFormat = (minify: boolean) => {
		const parsed = parseCurrent();
		if (!parsed.ok) {
			setStatus({ kind: 'error', text: messages.formatInvalid });
			return;
		}
		setText(minify ? JSON.stringify(parsed.value) : JSON.stringify(parsed.value, null, indentValue(indent)));
		setStatus(null);
	};

	const handleRepair = async () => {
		const original = getText();
		try {
			JSON.parse(original);
			setStatus({ kind: 'ok', text: messages.repairedNone });
			return;
		} catch {
			// needs repair
		}
		try {
			const ndjson = parseNdjson(original);
			let repaired: string;
			const issues = detectRepairIssues(original);
			if (ndjson) {
				repaired = JSON.stringify(ndjson, null, indentValue(indent));
				if (!issues.includes('ndjson')) issues.push('ndjson');
			} else {
				const { jsonrepair } = await import('jsonrepair');
				repaired = JSON.stringify(JSON.parse(jsonrepair(original)), null, indentValue(indent));
			}
			setText(repaired);
			setStatus({
				kind: 'ok',
				text: issues.length
					? `${messages.repairedPrefix} ${issues.map((i) => issueLabel[i]).join('; ')}`
					: messages.repairedGeneric,
			});
		} catch {
			setStatus({ kind: 'error', text: messages.repairFailed });
		}
	};

	const handleShare = async () => {
		try {
			const compressed = await compressToUrlSafeBase64(getText());
			const link = `${window.location.origin}${window.location.pathname}#json=${compressed}`;
			await navigator.clipboard.writeText(link);
			setStatus({ kind: 'ok', text: messages.shareCopied });
		} catch {
			setStatus({ kind: 'error', text: messages.shareFailed });
		}
	};

	const handleGenerateCode = () => {
		const parsed = parseCurrent();
		if (!parsed.ok) {
			setCodeError(true);
			setCodeOutput(null);
			return;
		}
		setCodeError(false);
		setCodeOutput(generateCode(parsed.value, language, rootName.trim() || 'Root'));
	};

	const handleGenerateSchema = () => {
		const parsed = parseCurrent();
		if (!parsed.ok) {
			setSchemaOutput('');
			setStatus({ kind: 'error', text: messages.needValidJson });
			return;
		}
		setStatus(null);
		setSchemaOutput(JSON.stringify(inferJsonSchema(parsed.value), null, 2));
	};

	const handleValidate = () => {
		const parsed = parseCurrent();
		if (!parsed.ok) {
			setValidateResult(null);
			setStatus({ kind: 'error', text: messages.needValidJson });
			return;
		}
		let schema: unknown;
		try {
			schema = JSON.parse(schemaInput);
		} catch {
			setValidateResult({ bad: true });
			return;
		}
		setStatus(null);
		setValidateResult({ errors: validateJsonSchema(parsed.value, schema) });
	};

	const handlePath = () => {
		const parsed = parseCurrent();
		if (!parsed.ok) {
			setPathResult({ error: messages.needValidJson });
			return;
		}
		try {
			setPathResult({ matches: queryJsonPath(parsed.value, pathQuery) });
		} catch (error) {
			setPathResult({ error: error instanceof JsonPathError ? `${messages.pathSyntax} ${error.message}` : messages.pathSyntax });
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
			<span className="text-sm font-medium text-foreground">{messages.heading}</span>

			<div className="flex flex-wrap items-center gap-2">
				<label className="flex items-center gap-2 text-sm text-foreground">
					{messages.indentLabel}
					<select value={indent} onChange={(e) => setIndent(e.target.value as Indent)} className={fieldClass}>
						<option value="2">{messages.indent2}</option>
						<option value="4">{messages.indent4}</option>
						<option value="tab">{messages.indentTab}</option>
					</select>
				</label>
				<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => handleFormat(false)}>
					{messages.format}
				</Button>
				<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => handleFormat(true)}>
					{messages.minify}
				</Button>
				<Button type="button" size="sm" className="min-h-9" onClick={() => void handleRepair()}>
					{messages.repair}
				</Button>
				<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => void handleShare()}>
					{messages.share}
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">{messages.shareNote}</p>
			{status && (
				<p
					role={status.kind === 'error' ? 'alert' : 'status'}
					className={`rounded-md border p-2 text-sm ${
						status.kind === 'error'
							? 'border-destructive/40 bg-destructive/10 text-destructive'
							: 'border-primary/40 bg-primary/10 text-foreground'
					}`}
				>
					{status.text}
				</p>
			)}

			<details className="rounded-md border border-border p-3">
				<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.codeHeading}</summary>
				<div className="mt-3 flex flex-col gap-2">
					<div className="flex flex-wrap items-end gap-2">
						<label className="flex flex-col gap-1 text-xs text-muted-foreground">
							{messages.codeLanguage}
							<select value={language} onChange={(e) => setLanguage(e.target.value as CodeLanguage)} className={fieldClass}>
								{LANGUAGES.map((item) => (
									<option key={item.value} value={item.value}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-xs text-muted-foreground">
							{messages.rootName}
							<input type="text" value={rootName} onChange={(e) => setRootName(e.target.value)} className={`${fieldClass} w-36`} />
						</label>
						<Button type="button" size="sm" className="min-h-9" onClick={handleGenerateCode}>
							{messages.codeGenerate}
						</Button>
					</div>
					{codeError && (
						<p role="alert" className="text-sm text-destructive">
							{messages.needValidJson}
						</p>
					)}
					{codeOutput !== null && (
						<>
							<textarea readOnly value={codeOutput} rows={12} spellCheck={false} aria-label={messages.codeHeading} className={areaClass} />
							<div>
								<CopyButton text={codeOutput} messages={messages} />
							</div>
						</>
					)}
				</div>
			</details>

			<details className="rounded-md border border-border p-3">
				<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.schemaHeading}</summary>
				<div className="mt-3 flex flex-col gap-3">
					<div className="flex flex-col gap-2">
						<div>
							<Button type="button" size="sm" className="min-h-9" onClick={handleGenerateSchema}>
								{messages.schemaGenerate}
							</Button>
						</div>
						{schemaOutput && (
							<>
								<textarea readOnly value={schemaOutput} rows={10} spellCheck={false} aria-label={messages.schemaOutputLabel} className={areaClass} />
								<div className="flex flex-wrap gap-2">
									<CopyButton text={schemaOutput} messages={messages} />
									<Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => setSchemaInput(schemaOutput)}>
										{messages.validateHeading}
									</Button>
								</div>
							</>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="json-schema-input" className="text-xs text-muted-foreground">
							{messages.schemaInputLabel}
						</label>
						<textarea
							id="json-schema-input"
							value={schemaInput}
							onChange={(e) => setSchemaInput(e.target.value)}
							placeholder={messages.schemaInputPlaceholder}
							rows={8}
							spellCheck={false}
							className={areaClass}
						/>
						<div>
							<Button type="button" size="sm" className="min-h-9" onClick={handleValidate}>
								{messages.validateButton}
							</Button>
						</div>
						{validateResult && 'bad' in validateResult && (
							<p role="alert" className="text-sm text-destructive">
								{messages.schemaInvalid}
							</p>
						)}
						{validateResult && 'errors' in validateResult && validateResult.errors.length === 0 && (
							<p role="status" className="text-sm text-primary">
								{messages.validateOk}
							</p>
						)}
						{validateResult && 'errors' in validateResult && validateResult.errors.length > 0 && (
							<div className="flex flex-col gap-1">
								<p role="status" className="text-xs text-muted-foreground">
									{messages.validateErrors.replace('{{count}}', String(validateResult.errors.length))}
								</p>
								<ul className="flex flex-col gap-1 rounded-md border border-border p-2 font-mono text-xs">
									{validateResult.errors.map((error, i) => (
										<li key={i} className="[overflow-wrap:anywhere]">
											<span className="text-foreground">{error.path}</span>{' '}
											<span className="text-destructive">{error.message}</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</div>
			</details>

			<details className="rounded-md border border-border p-3">
				<summary className="cursor-pointer text-sm font-medium text-foreground">{messages.pathHeading}</summary>
				<div className="mt-3 flex flex-col gap-2">
					<div className="flex flex-wrap items-end gap-2">
						<label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
							{messages.pathLabel}
							<input
								type="text"
								value={pathQuery}
								onChange={(e) => setPathQuery(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') handlePath();
								}}
								placeholder={messages.pathPlaceholder}
								spellCheck={false}
								className={`${fieldClass} min-w-48 font-mono`}
							/>
						</label>
						<Button type="button" size="sm" className="min-h-9" onClick={handlePath}>
							{messages.pathRun}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">{messages.pathHelp}</p>
					{pathResult && 'error' in pathResult && (
						<p role="alert" className="text-sm text-destructive">
							{pathResult.error}
						</p>
					)}
					{pathResult && 'matches' in pathResult && (
						<div className="flex flex-col gap-1">
							<p role="status" className="text-xs text-muted-foreground">
								{pathResult.matches.length === 0 ? messages.pathNone : messages.pathResults.replace('{{count}}', String(pathResult.matches.length))}
							</p>
							{pathResult.matches.length > 0 && (
								<>
									<textarea
										readOnly
										rows={10}
										spellCheck={false}
										aria-label={messages.pathHeading}
										className={areaClass}
										value={JSON.stringify(
											pathResult.matches.length === 1 ? pathResult.matches[0].value : pathResult.matches.map((m) => m.value),
											null,
											2,
										)}
									/>
									<details>
										<summary className="cursor-pointer text-xs text-muted-foreground">{messages.pathsLabel}</summary>
										<ul className="mt-1 max-h-40 overflow-auto font-mono text-xs [overflow-wrap:anywhere]">
											{pathResult.matches.slice(0, 200).map((m, i) => (
												<li key={i}>{m.path}</li>
											))}
										</ul>
									</details>
								</>
							)}
						</div>
					)}
				</div>
			</details>
		</div>
	);
}
