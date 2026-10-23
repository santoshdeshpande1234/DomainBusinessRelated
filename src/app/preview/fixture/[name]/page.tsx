import { notFound } from "next/navigation";
import { SitePreview } from "@/components/site-preview";
import { fixtureSite } from "@/lib/studio/fixtures";
import { isDirection } from "@/lib/studio/design";

// Sample sites for the automated browser suite. Disabled unless SITE_FIXTURES=1, so it never exists in production.
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ name: string }>; searchParams: Promise<{ page?: string; view?: string; d?: string }> };

export default async function FixturePage({ params, searchParams }: Props) {
  if (process.env.SITE_FIXTURES !== "1") notFound();
  const { name } = await params;
  const sp = await searchParams;
  const f = fixtureSite(name);
  if (!f) notFound();
  const d = sp.d && isDirection(sp.d) ? sp.d : null;
  const q = d ? `&d=${d}` : "";
  const links = { site: `/preview/fixture/${name}${d ? `?d=${d}` : ""}`, plan: `/preview/fixture/${name}?view=plan${q}` };
  const slug = sp.page && /^[a-z0-9-]{1,60}$/.test(sp.page) ? sp.page : null;
  const pageHref = (s: string) => (s === "home" ? links.site : `/preview/fixture/${name}?page=${s}${q}`);
  return <SitePreview content={f.content} theme={d ?? f.theme} layout={f.layout} domain={null} owner="Domain2Revenue" year={2026}
    view={sp.view === "plan" ? "plan" : "site"} links={links} page={slug} pageHref={pageHref} />;
}
