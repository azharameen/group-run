export interface SubagentStatus {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  current_task?: string;
  last_active?: string;
}

export interface ToolCallEvent {
  id: string;
  tool_name: string;
  arguments: Record<string, any>;
  output?: string;
  status: 'running' | 'completed' | 'failed';
  timestamp: string;
  agent?: string;
  speaker?: string;
  role?: string;
  provenance?: string;
}

export interface InterruptItem {
  id: string;
  idea_id: string;
  type: string;
  details: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  speaker?: string;
  role?: string;
  provenance?: string;
}

export interface AgentTodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed';
  assigned_agent?: string;
}

export interface ArtifactDiff {
  version_a: string;
  version_b: string;
  file_name: string;
  content_a: string;
  content_b: string;
}

export type RuntimeEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'subagent'
  | 'handover'
  | 'interrupt'
  | 'approval'
  | 'retry'
  | 'failed'
  | 'completion'
  | 'done'
  | 'token'
  | 'tasks_update'
  | 'transition'
  | 'user_message'

export interface RuntimeEvent {
  type: RuntimeEventType;
  content?: string;
  agent?: string;
  speaker?: string;
  role?: string;
  tool?: string;
  params?: Record<string, any>;
  output?: any;
  action?: string;
  from_agent?: string;
  to_agent?: string;
  interrupt_id?: string;
  decision?: 'approve' | 'edit' | 'reject' | 'retry';
  reason?: string;
  provenance?: string;
  state?: string;
  status?: string;
  tasks?: any[];
  completed?: number;
  total?: number;
}

export interface TranscriptEvent extends RuntimeEvent {
  idea_id?: string;
  trust?: string;
  metadata?: Record<string, any>;
}
