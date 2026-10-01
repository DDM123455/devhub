// Static library of commonly used patterns for the Regex Tester. Names are translated via
// i18n (ui.x.lib.<id>); patterns are ECMAScript regex source.

export interface RegexLibraryEntry {
	id: string;
	pattern: string;
	flags: string;
	/** Sample text loaded into the test string (one candidate per line). */
	sample: string;
}

export const REGEX_LIBRARY: RegexLibraryEntry[] = [
	{
		id: 'email',
		pattern: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$',
		flags: 'gm',
		sample: 'user@example.com\nfirst.last+tag@sub.domain.co\nnot-an-email@\n@missing.local',
	},
	{
		id: 'url',
		pattern: 'https?:\\/\\/(?:www\\.)?[-\\w@:%.+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b[-\\w()@:%+.~#?&/=]*',
		flags: 'g',
		sample: 'Docs at https://example.com/path?x=1#top and http://www.test.org.\nftp://old.example.com is not matched.',
	},
	{
		id: 'ipv4',
		pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b',
		flags: 'g',
		sample: '192.168.1.1\n10.0.0.255\n256.1.1.1\n1.2.3',
	},
	{
		id: 'isoDate',
		pattern: '\\b(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])\\b',
		flags: 'g',
		sample: '2024-02-29\n1999-12-31\n2024-13-01\n24-1-1',
	},
	{
		id: 'time24',
		pattern: '\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b',
		flags: 'g',
		sample: '08:30\n23:59:59\n24:00\n7:5',
	},
	{
		id: 'hexColor',
		pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b',
		flags: 'g',
		sample: '#fff\n#1A2b3C\n#12345\nrgb(0,0,0)',
	},
	{
		id: 'vnPhone',
		pattern: '(?:\\+84|0084|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\\d)\\d{7}\\b',
		flags: 'g',
		sample: '0912345678\n+84987654321\n0328123456\n0123456789',
	},
	{
		id: 'strongPassword',
		pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}$',
		flags: 'gm',
		sample: 'Passw0rd!\nweakpass\nNoDigits!!\nSh0rt!A',
	},
	{
		id: 'slug',
		pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
		flags: 'gm',
		sample: 'hello-world\nweb-tool-hub-2\nHello-World\ntrailing-',
	},
	{
		id: 'uuid',
		pattern: '\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b',
		flags: 'gi',
		sample: '123e4567-e89b-12d3-a456-426614174000\nnot-a-uuid\n550E8400-E29B-41D4-A716-446655440000',
	},
	{
		id: 'username',
		pattern: '^[a-zA-Z][a-zA-Z0-9_]{2,15}$',
		flags: 'gm',
		sample: 'john_doe\nab\n9lives\nvalid_user_1',
	},
	{
		id: 'number',
		pattern: '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?',
		flags: 'g',
		sample: 'Values: 42, -3.14, +.5, 1e-9 and 6.02E23',
	},
	{
		id: 'htmlTag',
		pattern: '<\\/?([a-zA-Z][\\w-]*)(?:\\s+[^<>]*?)?\\/?>',
		flags: 'g',
		sample: '<div class="a"><p>Hi</p><br/></div>',
	},
	{
		id: 'duplicateWords',
		pattern: '\\b(\\w+)\\s+\\1\\b',
		flags: 'gi',
		sample: 'This is is a test of the the system.',
	},
];
