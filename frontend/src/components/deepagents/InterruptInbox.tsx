import { useEffect, useState, useCallback } from 'react';
import {
  HITLApprovalCard,
  type HITLApprovalCardProps,
} from './HITLApprovalCard';
import { connectSSE, fetchPendingInterrupts, type InterruptPayload } from '@/api/threads';

export interface InterruptInboxProps {
  onActionComplete?: () => void;
}

// Re-export HITLApprovalCard props for consumers
export type { HITLApprovalCardProps };

export const InterruptInbox: React.FC<InterruptInboxProps> = ({ onActionComplete }) => {
  const [interrupts, setInterrupts] = useState<InterruptPayload[]>([]);

  const loadInterrupts = useCallback(async () => {
    try {
      const data = await fetchPendingInterrupts();
      setInterrupts(data);
    } catch (err) {
      console.error('Failed to load interrupts:', err);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    loadInterrupts();
  }, [loadInterrupts]);

  // SSE for real-time updates
  useEffect(() => {
    const es = connectSSE(
      (_event, _data) => {
        // legacy named events — no-op for interrupts
      },
      undefined, // onError
      (eventType, payload) => {
        if (eventType === 'interrupt.created') {
          loadInterrupts();
        } else if (
          eventType === 'interrupt.approved' ||
          eventType === 'interrupt.rejected'
        ) {
          setInterrupts(prev =>
            prev.filter(i => i.id !== payload.interrupt?.id),
          );
        }
      },
    );
    return () => es.close();
  }, [loadInterrupts]);

  const handleApproved = useCallback(
    (id: string) => {
      setInterrupts(prev => prev.filter(i => i.id !== id));
      onActionComplete?.();
    },
    [onActionComplete],
  );

  const handleRejected = useCallback(
    (id: string) => {
      setInterrupts(prev => prev.filter(i => i.id !== id));
      onActionComplete?.();
    },
    [onActionComplete],
  );

  return (
    <HITLApprovalCard
      interrupts={interrupts}
      onApproved={handleApproved}
      onRejected={handleRejected}
    />
  );
};

export default InterruptInbox;
