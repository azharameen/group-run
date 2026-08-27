import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchIdeas,
  fetchIdeaDetail,
  fetchIdeaFiles,
  createIdea,
  deleteIdea,
  addIdeaComment,
  recordIdeaMaturity,
} from "@/api/ideas";
import { triggerWorkItemValidation } from "@/api/workItems";


export const ideaKeys = {
  all: ["ideas"] as const,
  lists: () => [...ideaKeys.all, "list"] as const,
  details: () => [...ideaKeys.all, "detail"] as const,
  detail: (id: string) => [...ideaKeys.details(), id] as const,
  files: (id: string) => [...ideaKeys.detail(id), "files"] as const,
};

export function useIdeasQuery() {
  return useQuery({
    queryKey: ideaKeys.lists(),
    queryFn: () => fetchIdeas(),
  });
}

export function useIdeaDetailQuery(ideaId: string | undefined) {
  return useQuery({
    queryKey: ideaKeys.detail(ideaId ?? ""),
    queryFn: () => fetchIdeaDetail(ideaId!),
    enabled: Boolean(ideaId),
  });
}

export function useIdeaFilesQuery(ideaId: string | undefined) {
  return useQuery({
    queryKey: ideaKeys.files(ideaId ?? ""),
    queryFn: () => fetchIdeaFiles(ideaId!),
    enabled: Boolean(ideaId),
  });
}

export function useCreateIdeaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ signalText, title }: { signalText: string; title: string }) =>
      createIdea(signalText, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ideaKeys.lists() });
    },
  });
}

export function useDeleteIdeaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => deleteIdea(ideaId),
    onSuccess: (_, ideaId) => {
      queryClient.invalidateQueries({ queryKey: ideaKeys.lists() });
      queryClient.removeQueries({ queryKey: ideaKeys.detail(ideaId) });
    },
  });
}

export function useAddIdeaCommentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, text }: { ideaId: string; text: string }) =>
      addIdeaComment(ideaId, text),
    onSuccess: (_, { ideaId }) => {
      queryClient.invalidateQueries({ queryKey: ideaKeys.detail(ideaId) });
    },
  });
}

export function useRecordIdeaMaturityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ideaId,
      stage,
      criteria,
      evidence,
    }: {
      ideaId: string;
      stage: string;
      criteria: string[];
      evidence: string[];
    }) =>
      recordIdeaMaturity(ideaId, {
        stage,
        criteria,
        evidence_refs: evidence,
        recorded_by: "User",
      }),
    onSuccess: (_, { ideaId }) => {
      queryClient.invalidateQueries({ queryKey: ideaKeys.detail(ideaId) });
    },
  });
}

export function useRetryNoveltyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId }: { workItemId: string }) =>
      triggerWorkItemValidation(workItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ideaKeys.all });
    },
  });
}
