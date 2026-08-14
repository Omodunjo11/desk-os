import CaseClient from "@/components/CaseClient";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string; caseId: string }>;
}) {
  const { id, caseId } = await params;
  return <CaseClient processId={id} caseId={caseId} />;
}
