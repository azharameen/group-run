import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listThreads,
  getThread,
  createThread,
  deleteThread,
  updateThread,
  fetchPendingInterrupts,
  approveInterrupt,
  rejectInterrupt,
  type CreateThreadRequest,
} from "@/api/threads";

export const threadKeys = {
  all: ["threads"] as const,
  lists: () => [...threadKeys.all, "list"] as const,
  details: () => [...threadKeys.all, "detail"] as const,
  detail: (id: string) => [...threadKeys.details(), id] as const,
  interrupts: () => [...threadKeys.all, "interrupts"] as const,
};

export function useThreadsQuery() {
  return useQuery({
    queryKey: threadKeys.lists(),
    queryFn: () => listThreads(),
  });
}

export function useThreadDetailQuery(threadId: string | undefined) {
  return useQuery({
    queryKey: threadKeys.detail(threadId ?? ""),
    queryFn: () => getThread(threadId!),
    enabled: Boolean(threadId),
  });
}

export function usePendingInterruptsQuery() {
  return useQuery({
    queryKey: threadKeys.interrupts(),
    queryFn: () => fetchPendingInterrupts(),
  });
}

export function useCreateThreadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req?: CreateThreadRequest) => createThread(req || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
    },
  });
}

export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteThread(threadId),
    onSuccess: (_, threadId) => {
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
      queryClient.removeQueries({ queryKey: threadKeys.detail(threadId) });
    },
  });
}

export function useUpdateThreadTitleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      updateThread(threadId, { title }),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: threadKeys.detail(threadId) });
    },
  });
}

export function useApproveInterruptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      interruptId,
      decision,
      reason,
      reasoning,
    }: {
      interruptId: string;
      decision: string;
      reason: string;
      reasoning?: string;
    }) => approveInterrupt(interruptId, decision, reason, reasoning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.interrupts() });
    },
  });
}

export function useRejectInterruptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      interruptId,
      reason,
      reasoning,
    }: {
      interruptId: string;
      reason: string;
      reasoning?: string;
    }) => rejectInterrupt(interruptId, reason, reasoning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadKeys.interrupts() });
    },
  });
}
