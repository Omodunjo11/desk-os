import QueueClient from "@/components/QueueClient";

export default async function QueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QueueClient processId={id} />;
}
