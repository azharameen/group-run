import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSSE } from "@/api/client";
import { ideaKeys } from "@/hooks/queries/useIdeas";
import { workItemKeys } from "@/hooks/queries/useWorkItems";
import { orgKeys } from "@/hooks/queries/useOrganization";
import { threadKeys } from "@/hooks/queries/useThreads";

export type SSEEventHandler = (event: string, data: Record<string, unknown>) => void;

interface RealtimeContextValue {
  isConnected: boolean;
  subscribe: (handler: SSEEventHandler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const listenersRef = useRef<Set<SSEEventHandler>>(new Set());

  useEffect(() => {
    let active = true;

    const es = connectSSE((event: string, data?: Record<string, unknown>) => {
      if (!active) return;
      setIsConnected(true);
      const payload = data ?? {};

      // Invalidate relevant query caches reactively based on event type
      if (
        event.startsWith("idea.") ||
        event.startsWith("artifact.") ||
        event.startsWith("workflow.") ||
        event.startsWith("novelty.") ||
        event.startsWith("product-definition.")
      ) {
        queryClient.invalidateQueries({ queryKey: ideaKeys.all });
        queryClient.invalidateQueries({ queryKey: workItemKeys.all });
      } else if (event.startsWith("workitem.") || event.startsWith("department.")) {
        queryClient.invalidateQueries({ queryKey: workItemKeys.all });
        queryClient.invalidateQueries({ queryKey: orgKeys.all });
      } else if (event.startsWith("interrupt.") || event.startsWith("approval.")) {
        queryClient.invalidateQueries({ queryKey: threadKeys.interrupts() });
      }

      // Notify any local active event listeners
      listenersRef.current.forEach((handler) => {
        try {
          handler(event, payload);
        } catch (err) {
          console.error("Error in realtime listener:", err);
        }
      });
    });

    return () => {
      active = false;
      setIsConnected(false);
      es.close();
    };
  }, [queryClient]);

  const subscribe = (handler: SSEEventHandler) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  };

  return (
    <RealtimeContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}

export function useRealtimeSubscription(
  eventNames: string[] | "*",
  callback: (event: string, data: Record<string, unknown>) => void
) {
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe((event, data) => {
      if (eventNames === "*" || eventNames.includes(event)) {
        callback(event, data);
      }
    });
    return unsubscribe;
  }, [subscribe, eventNames, callback]);
}
