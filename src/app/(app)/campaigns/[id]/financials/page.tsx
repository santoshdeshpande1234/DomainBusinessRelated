import { Overview } from "../studio/overview";

export const metadata = { title: "Financial opportunity" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Overview id={(await params).id} focus="financials" />;
}
