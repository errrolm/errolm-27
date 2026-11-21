import type { MDXInstance } from "astro";

interface PostFrontmatter {
  title: string;
  date: string | Date;
  description?: string;
}

const modules = import.meta.glob<MDXInstance<PostFrontmatter>>("../content/posts/*.mdx", { eager: true });

export const posts = Object.entries(modules)
  .map(([path, entry]) => {
    const slug = path.slice(path.lastIndexOf("/") + 1, -4);
    const date = new Date(entry.frontmatter.date);
    return {
      slug,
      href: `/posts/${slug}`,
      title: entry.frontmatter.title,
      description: entry.frontmatter.description,
      entry,
      date,
      dateTime: date.toISOString().slice(0, 10),
    };
  })
  .sort((a, b) => b.date.getTime() - a.date.getTime());

export function formatPostDate(date: Date, month: "short" | "long" = "short") {
  return new Intl.DateTimeFormat("en", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
