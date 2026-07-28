import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SubagentStatus } from '@/types/deepagents';
import { Bot, Cpu, CheckCircle, Clock } from 'lucide-react';

interface SubagentActivityCardProps {
  subagents?: SubagentStatus[];
}

export const SubagentActivityCard: React.FC<SubagentActivityCardProps> = ({ subagents = [] }) => {
  if (!subagents || subagents.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3 p-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            DeepAgents Subagent Mesh
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          No active subagent records are available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 p-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            DeepAgents Subagent Mesh
          </CardTitle>
          <Badge variant="secondary" className="text-[11px]">
            Multi-Agent Architecture
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-4 pt-0">
        {subagents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between p-3 rounded-md bg-muted/30 border text-xs"
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-md ${
                agent.status === 'running' ? 'bg-primary/20 text-primary animate-pulse' :
                agent.status === 'completed' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {agent.status === 'running' ? <Cpu className="w-3.5 h-3.5" /> :
                 agent.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> :
                 <Clock className="w-3.5 h-3.5" />}
              </div>
              <div>
                <div className="font-medium text-foreground">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground">{agent.role}</div>
              </div>
            </div>
            <div className="text-right">
              <Badge
                variant={agent.status === 'running' ? 'default' : agent.status === 'completed' ? 'secondary' : 'outline'}
                className="text-[10px] uppercase font-mono"
              >
                {agent.status}
              </Badge>
              {agent.current_task && (
                <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate">
                  {agent.current_task}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
