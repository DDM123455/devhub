export const categories = [
  { slug: 'image' },
  { slug: 'pdf' },
  { slug: 'text' },
  { slug: 'dev' },
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];
