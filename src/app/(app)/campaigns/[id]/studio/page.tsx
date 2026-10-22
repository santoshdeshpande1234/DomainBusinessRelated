import { Overview } from "./overview";

export const metadata = { title: "Website studio" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Overview id={(await params).id} focus="studio" />;
}
