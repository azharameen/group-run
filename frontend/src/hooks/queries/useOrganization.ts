import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOrganizations,
  fetchOrganization,
  fetchOrganizationHealth,
  createOrganization,
} from "@/api/organizations";

export const orgKeys = {
  all: ["organizations"] as const,
  lists: () => [...orgKeys.all, "list"] as const,
  details: () => [...orgKeys.all, "detail"] as const,
  detail: (id: string) => [...orgKeys.details(), id] as const,
  health: (orgId: string) => [...orgKeys.detail(orgId), "health"] as const,
};

export function useOrganizationsQuery() {
  return useQuery({
    queryKey: orgKeys.lists(),
    queryFn: () => fetchOrganizations(),
  });
}

export function useOrganizationDetailQuery(orgId: string | undefined) {
  return useQuery({
    queryKey: orgKeys.detail(orgId ?? ""),
    queryFn: () => fetchOrganization(orgId!),
    enabled: Boolean(orgId),
  });
}

export function useOrganizationHealthQuery(orgId: string | undefined) {
  return useQuery({
    queryKey: orgKeys.health(orgId ?? ""),
    queryFn: () => fetchOrganizationHealth(orgId!),
    enabled: Boolean(orgId),
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      createOrganization(name, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() });
    },
  });
}
