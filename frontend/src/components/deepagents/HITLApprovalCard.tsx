import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { InterruptPayload } from '@/api/threads';
import { approveInterrupt, rejectInterrupt } from '@/api/threads';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, FileText,
} from 'lucide-react';

export interface HITLApprovalCardProps {
  interrupts: InterruptPayload[];
  onApproved?: (id: string) => void;
  onRejected?: (id: string) => void;
}

export const HITLApprovalCard: React.FC<HITLApprovalCardProps> = ({
  interrupts,
  onApproved,
  onRejected,
}) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleApprove = async (int: InterruptPayload) => {
    const reason = comments[int.id] || 'Approved during HITL review';
    try {
      setLoading(prev => ({ ...prev, [int.id]: true }));
      await approveInterrupt(int.id, 'approved', reason);
      toast({ title: 'Approved', description: `Interrupt "${int.tool_name}" approved.` });
      onApproved?.(int.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409')) {
        toast({ variant: 'destructive', title: 'Already resolved', description: 'This interrupt was already handled.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: msg });
      }
    } finally {
      setLoading(prev => ({ ...prev, [int.id]: false }));
    }
  };

  const handleReject = async (int: InterruptPayload) => {
    const reason = comments[int.id] || 'Revision requested';
    try {
      setLoading(prev => ({ ...prev, [int.id]: true }));
      await rejectInterrupt(int.id, reason);
      toast({ title: 'Rejected', description: `Interrupt "${int.tool_name}" rejected.` });
      onRejected?.(int.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404')) {
        toast({ variant: 'destructive', title: 'Not found', description: 'This interrupt was not found.' });
      } else if (msg.includes('409')) {
        toast({ variant: 'destructive', title: 'Already resolved', description: 'This interrupt was already handled.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: msg });
      }
    } finally {
      setLoading(prev => ({ ...prev, [int.id]: false }));
    }
  };

  if (!interrupts.length) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-emerald-500" />
          No pending approvals.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {interrupts.map((item) => (
        <Card key={item.id} className={cn('border-amber-500/40 bg-card')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                <CardTitle className="text-sm font-semibold">HITL Approval Required</CardTitle>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                <FileText className="w-3 h-3 mr-1" />
                {item.tool_name}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{item.message || 'The agent requires reviewer sign-off to proceed.'}</p>
            {item.tool_input && (
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-24">
                {JSON.stringify(item.tool_input, null, 2)}
              </pre>
            )}
            <Textarea
              placeholder="Add reason or feedback..."
              value={comments[item.id] || ''}
              onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })}
              className="bg-background text-xs"
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-3 pt-2">
            <Button
              data-testid="reject-button"
              variant="outline"
              size="sm"
              onClick={() => handleReject(item)}
              disabled={loading[item.id]}
              className="text-destructive hover:bg-destructive/10"
            >
              {loading[item.id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
              Reject
            </Button>
            <Button
              data-testid="approve-button"
              size="sm"
              onClick={() => handleApprove(item)}
              disabled={loading[item.id]}
            >
              {loading[item.id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Approve
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};
