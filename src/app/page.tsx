import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";

interface HomeProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  if (params.mode !== undefined) redirect("/");

  return <QueueArcade />;
}
