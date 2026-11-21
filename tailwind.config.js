import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,mdx,md}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [typography],
};
