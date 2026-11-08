import { useMemo, useState, type ComponentProps } from 'react';
import JsonFormatter from './JsonFormatter';
import { Button } from '@/components/ui/button';
import { formatXmlStrict } from '@/lib/text-format';
import { useCopyToClipboard } from './useCopyToClipboard';

interface XmlMessages {
  selector: string; input: string; output: string; format: string; validate: string;
  valid: string; hint: string; invalid: string; location: string; clear: string;
  copy: string; copied: string; copyFailed: string; download: string; tooLarge: string;
  indent: string; indentTab: string; indentSpaces: string; minify: string;
  viewText: string; viewTree: string; expandAll: string; collapseAll: string; treeEmpty: string;
}

const INDENTS: Record<string, string> = { '2': '  ', '4': '    ', tab: '\t' };

function XmlTreeNode({ node, depth, openAll }: { node: Element; depth: number; openAll: boolean | null }) {
  const attrs = Array.from(node.attributes);
  const kids = Array.from(node.childNodes).filter((c) => c.nodeType === 1 || c.nodeType === 3 || c.nodeType === 4 || c.nodeType === 8);
  const onlyText = kids.length > 0 && kids.every((c) => c.nodeType === 3 || c.nodeType === 4);
  const open = (
    <>
      <span className="text-primary">&lt;{node.tagName}</span>
      {attrs.map((a) => (
        <span key={a.name}> <span className="text-amber-600 dark:text-amber-400">{a.name}</span>=<span className="text-emerald-700 dark:text-emerald-400">"{a.value}"</span></span>
      ))}
    </>
  );
  if (kids.length === 0) return <div className="pl-4">{open}<span className="text-primary"> /&gt;</span></div>;
  if (onlyText) {
    return <div className="whitespace-pre-wrap pl-4">{open}<span className="text-primary">&gt;</span>{node.textContent}<span className="text-primary">&lt;/{node.tagName}&gt;</span></div>;
  }
  return (
    <details className="pl-4" open={openAll ?? depth < 2} key={String(openAll)}>
      <summary className="cursor-pointer select-none">{open}<span className="text-primary">&gt;</span> <span className="text-muted-foreground">({kids.filter((c) => c.nodeType === 1).length})</span></summary>
      {kids.map((c, i) =>
        c.nodeType === 1 ? <XmlTreeNode key={i} node={c as Element} depth={depth + 1} openAll={openAll} />
          : c.nodeType === 8 ? <div key={i} className="pl-4 text-muted-foreground">&lt;!--{c.textContent}--&gt;</div>
            : <div key={i} className="whitespace-pre-wrap pl-4">{c.textContent}</div>)}
    </details>
  );
}

export default function JsonXmlFormatter({ messages, xml }: {
  messages: ComponentProps<typeof JsonFormatter>['messages']; xml: XmlMessages;
}) {
  const [mode, setMode] = useState('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState('2');
  const [view, setView] = useState<'text' | 'tree'>('text');
  const [openAll, setOpenAll] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const { copy, copied, failed } = useCopyToClipboard();

  function run(action: 'format' | 'validate' | 'minify') {
    if (input.length > 200_000) { setStatus({ error: true, text: xml.tooLarge }); return; }
    const result = formatXmlStrict(input, INDENTS[indent]);
    if ('error' in result) {
      const where = result.error.line ? xml.location.replace('{{line}}', String(result.error.line)).replace('{{column}}', String(result.error.column ?? 1)) : '';
      setStatus({ error: true, text: xml.invalid.replace('{{message}}', result.error.message) + ' ' + where });
      setOutput('');
      return;
    }
    if (action === 'format') setOutput(result.value);
    // Serialize the original document: trimming formatted lines corrupts text/CDATA.
    // Preserve all text whitespace because its significance requires a schema.
    if (action === 'minify') setOutput(new XMLSerializer().serializeToString(new DOMParser().parseFromString(input, 'application/xml')));
    setStatus({ error: false, text: xml.valid });
  }
  function reset() { setInput(''); setOutput(''); setStatus(null); setOpenAll(null); }
  function download() {
    const url = URL.createObjectURL(new Blob([output], { type: 'application/xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'formatted.xml'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const root = useMemo(() => {
    if (!output || view !== 'tree') return null;
    const doc = new DOMParser().parseFromString(output, 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc.documentElement;
  }, [output, view]);

  const seg = (active: boolean) => `rounded-md border px-3 py-1.5 text-sm font-medium ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`;
  return <div className="space-y-4">
    <div role="group" aria-label={xml.selector} className="flex items-center gap-2">
      <span className="text-sm font-medium">{xml.selector}</span>
      <button type="button" className={seg(mode === 'json')} aria-pressed={mode === 'json'} onClick={() => setMode('json')}>JSON</button>
      <button type="button" className={seg(mode === 'xml')} aria-pressed={mode === 'xml'} onClick={() => setMode('xml')}>XML</button>
    </div>
    <div hidden={mode !== 'json'}><JsonFormatter messages={messages} /></div>
    <div hidden={mode !== 'xml'} className="space-y-4">
      <p className="text-sm text-muted-foreground">{xml.hint}</p>
      <label className="block space-y-2"><span>{xml.input}</span>
        <textarea className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm" rows={12} spellCheck={false} value={input}
          onChange={e => { setInput(e.target.value); setOutput(''); setStatus(null); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run('format'); } }} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">{xml.indent}
          <select className="rounded-md border border-border bg-background p-2" value={indent} onChange={e => setIndent(e.target.value)}>
            <option value="2">{xml.indentSpaces.replace('{{n}}', '2')}</option>
            <option value="4">{xml.indentSpaces.replace('{{n}}', '4')}</option>
            <option value="tab">{xml.indentTab}</option>
          </select>
        </label>
        <Button onClick={() => run('format')}>{xml.format}</Button>
        <Button variant="outline" onClick={() => run('minify')}>{xml.minify}</Button>
        <Button variant="outline" onClick={() => run('validate')}>{xml.validate}</Button>
        <Button variant="ghost" onClick={reset}>{xml.clear}</Button>
      </div>
      {status && <p role={status.error ? 'alert' : 'status'} className={status.error ? 'text-destructive' : 'text-primary'}>{status.text}</p>}
      {output && <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{xml.output}</span>
          <div className="flex gap-2">
            <button type="button" className={seg(view === 'text')} aria-pressed={view === 'text'} onClick={() => setView('text')}>{xml.viewText}</button>
            <button type="button" className={seg(view === 'tree')} aria-pressed={view === 'tree'} onClick={() => setView('tree')}>{xml.viewTree}</button>
          </div>
        </div>
        {view === 'text'
          ? <textarea readOnly aria-label={xml.output} value={output} rows={12} className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm" />
          : <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenAll(true)}>{xml.expandAll}</Button>
              <Button size="sm" variant="outline" onClick={() => setOpenAll(false)}>{xml.collapseAll}</Button>
            </div>
            <div className="max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-3 font-mono text-sm">
              {root ? <XmlTreeNode node={root} depth={0} openAll={openAll} /> : <p className="text-muted-foreground">{xml.treeEmpty}</p>}
            </div>
          </div>}
        <div className="flex gap-2"><Button variant="outline" onClick={() => copy(output)}>{copied ? xml.copied : failed ? xml.copyFailed : xml.copy}</Button><Button variant="outline" onClick={download}>{xml.download}</Button></div>
      </div>}
    </div>
  </div>;
}
