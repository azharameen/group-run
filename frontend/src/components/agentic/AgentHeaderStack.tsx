import React from 'react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Bot, UserCheck, Sparkles, Cpu, ShieldCheck } from 'lucide-react';

export interface AgentMember {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  status: 'online' | 'active' | 'offline';
  initials: string;
}

interface AgentHeaderStackProps {
  activeAgent?: string;
}

export const AgentHeaderStack: React.FC<AgentHeaderStackProps> = ({ activeAgent }) => {
  const teamMembers: AgentMember[] = [
    { id: '1', name: 'Alex', role: 'Lead Patent Engineer', avatarColor: 'bg-blue-600 text-white', status: 'active', initials: 'AE' },
    { id: '2', name: 'David', role: 'Prior-Art Data Analyst', avatarColor: 'bg-emerald-600 text-white', status: 'active', initials: 'DA' },
    { id: '3', name: 'Emma', role: 'IP Strategy Manager', avatarColor: 'bg-pink-600 text-white', status: 'online', initials: 'EM' },
    { id: '4', name: 'Siemens Counsel', role: 'Governance & Validation', avatarColor: 'bg-amber-600 text-white', status: 'active', initials: 'SC' },
  ];

  return (
    <div className="flex items-center justify-between p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl backdrop-blur mb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-2 overflow-hidden">
          {teamMembers.map((member) => (
            <div key={member.id} className="relative group">
              <Avatar className="h-8 w-8 border-2 border-zinc-900 ring-2 ring-indigo-500/20">
                <AvatarFallback className={`text-xs font-bold ${member.avatarColor}`}>
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-zinc-900 ${
                member.status === 'active' ? 'bg-emerald-400 animate-pulse' :
                member.status === 'online' ? 'bg-indigo-400' : 'bg-zinc-600'
              }`} />
              
              {/* Tooltip on hover */}
              <div className="absolute top-10 left-0 hidden group-hover:block z-50 p-2 bg-zinc-900 border border-zinc-700 rounded text-xs whitespace-nowrap shadow-xl">
                <div className="font-semibold text-zinc-100">{member.name}</div>
                <div className="text-zinc-400">{member.role}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block">
          <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Agentic Invention Team
          </div>
          <div className="text-[11px] text-zinc-400">
            Active Focus: <span className="text-indigo-300 font-mono">{activeAgent || 'Discovery & Drafting Subagents'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-950/30 text-emerald-300 text-xs gap-1">
          <Cpu className="w-3 h-3 text-emerald-400" />
          Autonomous Runner Active
        </Badge>
      </div>
    </div>
  );
};
