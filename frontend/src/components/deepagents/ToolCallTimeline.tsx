import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ToolCallEvent } from '@/types/deepagents';
import { Terminal, ChevronDown, ChevronRight, Wrench } from 'lucide-react';

interface ToolCallTimelineProps {
  events?: ToolCallEvent[];
}

export const ToolCallTimeline: React.FC<ToolCallTimelineProps> = ({ events = [] }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const defaultEvents: ToolCallEvent[] = events.length > 0 ? events : [
    {
      id: 't1',
      tool_name: 'read_file',
      arguments: { path: '/instructions/siemens-validator-instructions.md' },
      output: 'Loaded 42 lines of governance criteria.',
      status: 'completed',
      timestamp: '11:20:15'
    },
    {
      id: 't2',
      tool_name: 'query_kb',
      arguments: { query: 'industrial ai digital twin anomaly detection' },
      output: 'Retrieved 3 prior-art patents matching category IND_AI.',
      status: 'completed',
      timestamp: '11:20:28'
    },
    {
      id: 't3',
      tool_name: 'write_file',
      arguments: { path: '/workspace/ideas/ideascope-draft.md' },
      output: 'File updated with 1200 bytes.',
      status: 'running',
      timestamp: '11:20:45'
    }
  ];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 p-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Tool Call Execution Stream
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 p-4 pt-0">
        {defaultEvents.map((evt) => {
          const isExp = !!expanded[evt.id];
          return (
            <div key={evt.id} className="border rounded-md bg-muted/20 text-xs">
              <div
                onClick={() => toggleExpand(evt.id)}
                className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 font-mono text-foreground">
                  {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <Terminal className="w-3.5 h-3.5 text-primary" />
                  <span>{evt.tool_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono">{evt.timestamp}</span>
                  <Badge
                    variant={evt.status === 'completed' ? 'secondary' : evt.status === 'running' ? 'default' : 'destructive'}
                    className="text-[10px] uppercase font-mono"
                  >
                    {evt.status}
                  </Badge>
                </div>
              </div>

              {isExp && (
                <div className="p-3 bg-muted/40 border-t font-mono text-[11px] space-y-2 text-foreground">
                  <div>
                    <span className="text-muted-foreground font-semibold">Arguments:</span>
                    <pre className="mt-1 p-2 rounded bg-background border overflow-x-auto text-xs">
                      {JSON.stringify(evt.arguments, null, 2)}
                    </pre>
                  </div>
                  {evt.output && (
                    <div>
                      <span className="text-muted-foreground font-semibold">Output Payload:</span>
                      <pre className="mt-1 p-2 rounded bg-background border overflow-x-auto text-xs text-emerald-600 dark:text-emerald-400">
                        {evt.output}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
