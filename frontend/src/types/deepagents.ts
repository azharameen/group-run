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
}

export interface InterruptItem {
  id: string;
  idea_id: string;
  type: string;
  details: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
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
