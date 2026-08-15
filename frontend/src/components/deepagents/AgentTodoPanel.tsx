import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { AgentTodoItem } from '../../types/deepagents';
import { ListTodo } from 'lucide-react';

interface AgentTodoPanelProps {
  todos?: AgentTodoItem[];
}

export const AgentTodoPanel: React.FC<AgentTodoPanelProps> = ({ todos }) => {
  const defaultTodos: AgentTodoItem[] = todos && todos.length > 0 ? todos : [
    { id: '1', task: 'Extract core inventive concept & parameters', status: 'completed', assigned_agent: 'Discovery' },
    { id: '2', task: 'Query prior-art taxonomy database', status: 'completed', assigned_agent: 'Discovery' },
    { id: '3', task: 'Synthesize patent claims structure', status: 'in_progress', assigned_agent: 'Drafting' },
  ];

  return (
    <Card className="border-cyan-500/20 bg-zinc-950/70 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-cyan-300">
          <ListTodo className="w-5 h-5 text-cyan-400" />
          Agent Task Execution Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {defaultTodos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center justify-between p-2.5 rounded border border-zinc-800/60 bg-zinc-900/40"
          >
            <div className="flex items-center gap-3">
              <Checkbox checked={todo.status === 'completed'} disabled className="border-cyan-500/40 opacity-100" />
              <span className={`text-sm ${
                todo.status === 'completed' ? 'line-through text-zinc-500' :
                todo.status === 'in_progress' ? 'text-cyan-200 font-medium' :
                'text-zinc-300'
              }`}>
                {todo.task}
              </span>
            </div>
            {todo.assigned_agent && (
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {todo.assigned_agent}
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
