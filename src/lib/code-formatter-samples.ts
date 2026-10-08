// Sample snippets (code, not UI strings) for the "Load sample" dropdown. Each one is deliberately
// unformatted so the effect of Format is obvious. Labels are proper language names plus one i18n key.
import type { FormatLanguage } from './format-languages';

export type SampleId = FormatLanguage | 'broken';

export const SAMPLE_IDS: ReadonlyArray<SampleId> = [
	'json',
	'xml',
	'sql',
	'html',
	'css',
	'scss',
	'less',
	'javascript',
	'typescript',
	'yaml',
	'markdown',
	'graphql',
	'broken',
];

export const SAMPLES: Record<SampleId, string> = {
	json: '{"name":"web-tool-hub","version":"1.0.0","tags":["format","json"],"author":{"name":"Ada","active":true},"scores":[1,2,3.5],"note":null}',
	xml: '<?xml version="1.0" encoding="UTF-8"?><catalog><book id="b1"><title>Clean Code</title><price currency="USD">29.99</price></book><book id="b2"><title>Refactoring</title><price currency="USD">39.50</price></book></catalog>',
	sql: "select o.id, c.name as customer, sum(oi.quantity * oi.price) as total from orders o inner join customers c on c.id = o.customer_id left join order_items oi on oi.order_id = o.id where o.status in ('paid', 'shipped') group by o.id, c.name having sum(oi.quantity * oi.price) > 100 order by total desc;",
	html: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Demo</title><style>body{margin:0;font-family:sans-serif}.card{padding:1rem}</style></head><body><div class="card"><h1>Hello</h1><p>Some <b>bold</b> text.</p><ul><li>One</li><li>Two</li></ul></div><script>document.title="Hi";console.log("ready")</script></body></html>',
	css: 'body{margin:0;font-family:system-ui,sans-serif}.card{display:flex;padding:1rem 2rem;border:1px solid #ddd;border-radius:8px}.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.15)}@media (max-width:600px){.card{flex-direction:column}}',
	scss: '$primary:#3366ff;@mixin center{display:flex;align-items:center;justify-content:center}.card{@include center;color:$primary;&:hover{color:darken($primary,10%)}.title{font-weight:700}}',
	less: '@primary:#3366ff;.center(){display:flex;align-items:center;justify-content:center}.card{.center();color:@primary;&:hover{color:darken(@primary,10%)}.title{font-weight:700}}',
	javascript:
		'const users=[{id:1,name:"Ada"},{id:2,name:"Linus"}];function greet(user){if(!user){return "nobody"}return "Hello, "+user.name+"!"}const names=users.map(u=>greet(u)).filter(Boolean);export default async function load(url){const res=await fetch(url);return res.ok?res.json():[]}',
	typescript:
		"interface User{id:number;name:string;email?:string}type Role='admin'|'editor'|'viewer';export class Repo<T extends {id:number}>{private items:T[]=[];add(item:T):void{this.items.push(item)}find(id:number):T|undefined{return this.items.find(i=>i.id===id)}}const roles:Record<Role,number>={admin:3,editor:2,viewer:1};",
	yaml: "version: '3.8'\nservices:\n    web:\n        image:   nginx:latest\n        ports: [\"80:80\",   \"443:443\"]\n        environment:\n            NODE_ENV:   production\n            DEBUG: \"false\"\n    db:\n      image: postgres:16\n      volumes:\n          - db-data:/var/lib/postgresql/data\nvolumes:\n  db-data: {}\n",
	markdown: '# Title\nSome   text with *emphasis* and **strong**.\n* item one\n* item two\n    * nested\n\n|a|b|\n|-|-|\n|1|2|\n\n```bash\nnpm   install\n```\n\nSee [the docs](https://example.com).\n',
	graphql: 'query GetUser($id:ID!){user(id:$id){id name email posts(first:5){edges{node{id title}}}}}\nfragment F on User{id name}',
	broken: 'function total(items) {\n  let sum = 0;\n  for (const item of items {\n    sum += item.price;\n  }\n  return sum;\n}\n',
};
