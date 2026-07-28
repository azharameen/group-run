import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { CheckSquare, Clock, Cpu, CheckCircle2, User } from 'lucide-react';

export interface TaskCardItem {
  id: string;
  title: string;
  status: 'In Progress' | 'To Do' | 'Completed';
  assignedName: string;
  assignedRole: string;
  avatarColor: string;
  initials: string;
}

interface TaskKanbanBoardProps {
  tasks?: TaskCardItem[];
}

export const TaskKanbanBoard: React.FC<TaskKanbanBoardProps> = ({ tasks }) => {
  const defaultTasks: TaskCardItem[] = tasks && tasks.length > 0 ? tasks : [
    {
      id: 'task-1',
      title: 'Build the complete agentic organization web prototype: core orchestration engine, all 8 domain agents (Strategy, Product, Engineering, DevOps, QA, People & Culture, Finance, Security) plus Research agent, web dashboard UI for monitoring/control, end-to-end workflow integration, escalation system, and documentation.',
      status: 'In Progress',
      assignedName: 'Alex',
      assignedRole: 'Engineer',
      avatarColor: 'bg-blue-600 text-white',
      initials: 'AE',
    },
    {
      id: 'task-2',
      title: 'Compile the final exhaustive research report consolidating all findings into a polished document accessible from the web dashboard.',
      status: 'To Do',
      assignedName: 'David',
      assignedRole: 'Data Analyst',
      avatarColor: 'bg-emerald-600 text-white',
      initials: 'DA',
    },
    {
      id: 'task-3',
      title: 'Write all four research documents based on gathered information: literature-review.md, competitive-analysis.md, case-studies.md, and organizational-blueprint.md in /workspace/research/ directory.',
      status: 'In Progress',
      assignedName: 'David',
      assignedRole: 'Data Analyst',
      avatarColor: 'bg-emerald-600 text-white',
      initials: 'DA',
    },
    {
      id: 'task-4',
      title: 'Update the project context files (.atoms/PROGRESS.md and .atoms/ATOMS.md) with research completion status and key findings summary.',
      status: 'To Do',
      assignedName: 'David',
      assignedRole: 'Data Analyst',
      avatarColor: 'bg-emerald-600 text-white',
      initials: 'DA',
    },
    {
      id: 'task-5',
      title: 'Formulate core claims and verify Siemens IP guideline compliance.',
      status: 'Completed',
      assignedName: 'Emma',
      assignedRole: 'Product Manager',
      avatarColor: 'bg-pink-600 text-white',
      initials: 'EM',
    },
  ];

  const inProgressTasks = defaultTasks.filter((t) => t.status === 'In Progress');
  const toDoTasks = defaultTasks.filter((t) => t.status === 'To Do');
  const completedTasks = defaultTasks.filter((t) => t.status === 'Completed');

  const renderSection = (title: string, badgeVariant: string, items: TaskCardItem[]) => (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-2">
        <Badge
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            title === 'In Progress' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' :
            title === 'To Do' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' :
            'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          {title === 'In Progress' && <Cpu className="w-3 h-3 mr-1 animate-pulse" />}
          {title === 'To Do' && <Clock className="w-3 h-3 mr-1" />}
          {title === 'Completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
          {title}
        </Badge>
        <span className="text-xs text-zinc-400 font-mono">{items.length} Task</span>
      </div>

      <div className="space-y-3">
        {items.map((task) => (
          <Card key={task.id} className="border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-all p-4 shadow-sm">
            <p className="text-xs text-zinc-200 leading-relaxed font-normal mb-3">
              {task.title}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>-:-</span>
              </div>
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className={`text-[9px] font-bold ${task.avatarColor}`}>
                    {task.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-zinc-300">{task.assignedName}</span>
                <span className="text-zinc-500">{task.assignedRole}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderSection('In Progress', 'indigo', inProgressTasks)}
      {renderSection('To Do', 'zinc', toDoTasks)}
      {renderSection('Completed', 'emerald', completedTasks)}
    </div>
  );
};
