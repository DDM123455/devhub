export const categories = [
  { slug: 'image', letter: 'IMG', hue: 0 },
  { slug: 'pdf', letter: 'PDF', hue: 45 },
  { slug: 'text', letter: 'TXT', hue: 100 },
  { slug: 'dev', letter: 'DEV', hue: 160 },
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];
