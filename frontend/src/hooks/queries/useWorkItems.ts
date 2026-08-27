import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchWorkItems,
  fetchWorkItem,
  fetchLifecycleHistory,
  listDecisions,
  transitionWorkItem,
  decideWorkItemProductDefinition,
  triggerWorkItemProductDefinition,
} from "@/api/workItems";

export const workItemKeys = {
  all: ["workItems"] as const,
  lists: () => [...workItemKeys.all, "list"] as const,
  byOrg: (orgId: string) => [...workItemKeys.lists(), orgId] as const,
  details: () => [...workItemKeys.all, "detail"] as const,
  detail: (id: string) => [...workItemKeys.details(), id] as const,
  history: (id: string) => [...workItemKeys.detail(id), "history"] as const,
  decisions: (id: string) => [...workItemKeys.detail(id), "decisions"] as const,
};

export function useWorkItemsQuery(orgId: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.byOrg(orgId ?? ""),
    queryFn: () => fetchWorkItems(orgId!),
    enabled: Boolean(orgId),
  });
}

export function useWorkItemDetailQuery(workItemId: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.detail(workItemId ?? ""),
    queryFn: () => fetchWorkItem(workItemId!),
    enabled: Boolean(workItemId),
  });
}

export function useWorkItemHistoryQuery(workItemId: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.history(workItemId ?? ""),
    queryFn: () => fetchLifecycleHistory(workItemId!),
    enabled: Boolean(workItemId),
  });
}

export function useWorkItemDecisionsQuery(workItemId: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.decisions(workItemId ?? ""),
    queryFn: () => listDecisions({ work_item_id: workItemId! }),
    enabled: Boolean(workItemId),
  });
}

export function useAdvanceWorkItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workItemId,
      status,
      reasoning,
      decidedBy,
    }: {
      workItemId: string;
      status: string;
      reasoning?: string;
      decidedBy?: string;
    }) => transitionWorkItem(workItemId, { status, reasoning, decided_by: decidedBy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.all });
    },
  });
}

export function useApproveProductDefinitionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workItemId,
      actorId,
      decision,
      artifactVersion,
      reasoning,
      alternatives,
    }: {
      workItemId: string;
      actorId: string;
      decision: "approve" | "reject";
      artifactVersion: number;
      reasoning: string;
      alternatives?: string[];
    }) =>
      decideWorkItemProductDefinition(workItemId, {
        actor_id: actorId,
        decision,
        artifact_version: artifactVersion,
        reasoning,
        alternatives,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.all });
    },
  });
}

export function useRetryProductDefinitionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workItemId: string) => triggerWorkItemProductDefinition(workItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.all });
    },
  });
}
