import CaseWorkspaceClient from "@/components/CaseWorkspaceClient";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string; caseId: string }>;
}) {
  const { id, caseId } = await params;
  return <CaseWorkspaceClient processId={id} caseId={caseId} />;
}
