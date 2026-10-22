import { Overview } from "../studio/overview";

export const metadata = { title: "Competitor analysis" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Overview id={(await params).id} focus="competitors" />;
}
