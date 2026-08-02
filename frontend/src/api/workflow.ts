const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface PhaseGroup {
  name: string;
  states: string[];
  color: string;
}

export interface Stats {
  total_ideas: number;
  by_phase: Record<string, number>;
  by_state: Record<string, number>;
  average_score: number;
  ideas_above_threshold: number;
  ideas_at_threshold: number;
}

export interface WorkflowStatus {
  active_idea_id: string;
  active_idea: {
    idea_id: string;
    title: string;
    state: string;
    phase: string;
    active_processing: boolean;
    paused_processing?: boolean;
    active_agent: string;
    active_state: string;
    active_message: string;
    composite_score: number;
    running_agent?: string;
    created_at?: string;
  } | null;
  queued_count: number;
  queued_ideas: Array<{
    idea_id: string;
    title: string;
    state: string;
    phase: string;
    active_processing: boolean;
    paused_processing?: boolean;
    active_agent: string;
    active_state: string;
    active_message: string;
    composite_score: number;
    running_agent?: string;
    created_at?: string;
  }>;
  one_idea_focus: boolean;
}

export interface StateConfig {
  label: string;
  phase: string;
  description: string;
}

export interface PhaseMeta {
  label: string;
  color: string;
}

export interface WorkflowConfig {
  states: Record<string, StateConfig>;
  phases: Record<string, PhaseMeta>;
  ordered_states: string[];
}

export interface GateItem {
  id: string;
  description: string;
}

export interface GateChecklist {
  items: GateItem[];
}

export interface GateConfig {
  gates: Record<string, GateChecklist>;
}

export interface Topic {
  TopicId: number;
  TopicName: string;
  TopicDescription: string;
}

export interface Project {
  ProjectID: number;
  ProjectName: string;
  SBUName: string;
  LoBName: string;
}

export async function triggerCycle(): Promise<any> {
  return request('/workflow/cycle', { method: 'POST' });
}

export async function seedIdeas(count: number = 3): Promise<{ seeded: string[] }> {
  return request('/workflow/seed', {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

export async function fetchStats(): Promise<Stats> {
  return request<Stats>('/stats');
}

export async function fetchPhases(): Promise<Record<string, PhaseGroup>> {
  return request('/phases');
}

export async function fetchWorkflowStatus(): Promise<WorkflowStatus> {
  return request<WorkflowStatus>('/workflow/status');
}

export async function fetchWorkflowConfig(): Promise<WorkflowConfig> {
  return request<WorkflowConfig>('/config/workflow');
}

export async function fetchGateConfig(): Promise<GateConfig> {
  return request<GateConfig>('/config/gates');
}

export async function fetchCriteriaConfig(): Promise<any> {
  return request('/config/criteria');
}

export async function fetchTopics(): Promise<Topic[]> {
  try {
    return await request<Topic[]>('/config/topics');
  } catch {
    return [];
  }
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    return await request<Project[]>('/config/projects');
  } catch {
    return [];
  }
}

export async function generateAutonomousIdeas(maxIdeas: number = 3): Promise<any> {
  return request('/workflow/autonomous', {
    method: 'POST',
    body: JSON.stringify({ max_ideas: maxIdeas }),
  });
}

export async function findAutoPipeline(inputText: string, maxIdeas: number = 3): Promise<any> {
  return request('/auto-pipeline', {
    method: 'POST',
    body: JSON.stringify({ input_text: inputText, max_ideas: maxIdeas }),
  });
}

export async function submitPipeline(
  inputText: string = '',
  maxIdeas: number = 3,
  extra?: { topicName?: string; ideaCategory?: string; projectName?: string },
): Promise<any> {
  return request('/submit-pipeline', {
    method: 'POST',
    body: JSON.stringify({
      input_text: inputText,
      max_ideas: maxIdeas,
      topic_name: extra?.topicName || '',
      idea_category: extra?.ideaCategory || '',
      project_name: extra?.projectName || '',
    }),
  });
}
