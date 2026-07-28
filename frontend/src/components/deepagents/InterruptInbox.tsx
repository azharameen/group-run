import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { InterruptItem } from '@/types/deepagents';
import { approveInterrupt, rejectInterrupt } from '@/api/deepagents';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface InterruptInboxProps {
  ideaId: string;
  interrupts: InterruptItem[];
  onActionComplete?: () => void;
}

export const InterruptInbox: React.FC<InterruptInboxProps> = ({
  ideaId,
  interrupts,
  onActionComplete
}) => {
  const [comments, setComments] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleApprove = async (intId: string) => {
    try {
      setLoading(intId);
      await approveInterrupt(ideaId, 'IP Counsel', comments[intId] || 'Approved during HITL review');
      if (onActionComplete) onActionComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (intId: string) => {
    try {
      setLoading(intId);
      await rejectInterrupt(ideaId, 'IP Counsel', comments[intId] || 'Revision requested');
      if (onActionComplete) onActionComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  if (!interrupts || interrupts.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-primary" />
          No pending human approvals required. DeepAgents runtime is executing smoothly.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {interrupts.map((item) => (
        <Card key={item.id} className="border-amber-500/40 bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Human-in-the-Loop Approval Required
                </CardTitle>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                {item.type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>{item.details || 'The agent runtime requires reviewer sign-off to proceed to the next stage.'}</p>
            <Textarea
              placeholder="Add feedback or reviewer comments..."
              value={comments[item.id] || ''}
              onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })}
              className="bg-background text-xs"
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReject(item.id)}
              disabled={loading === item.id}
              className="text-destructive hover:bg-destructive/10 text-xs"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Reject & Request Edits
            </Button>
            <Button
              size="sm"
              onClick={() => handleApprove(item.id)}
              disabled={loading === item.id}
              className="text-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Approve State Gate
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};
