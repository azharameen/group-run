/**
 * Driver name union type.
 */
export type DriverName = 'antigravity' | 'gemini' | 'opencode' | 'copilot' | 'custom';

/**
 * Agent driver configuration.
 */
export interface AgentDriverConfig {
  command: string;
  args: string[];
}

/**
 * BMad CC Configuration Schema.
 */
export interface BmadCcConfig {
  projectRoot: string;
  paths: {
    sprintStatus: string;
    storyLocation: string;
    epics: string;
    prd?: string;
    architecture?: string;
    bmadSkills?: string;
    bmadConfig?: string;
  };
  agent: {
    driver: DriverName;
    model?: string;
    drivers: Record<string, AgentDriverConfig>;
    skillDrivers?: Record<string, DriverName>;
  };
  limits: {
    maxRetries: number;
    watchdogTimeoutSeconds: number;
    sessionTimeoutMinutes: number;
  };
  verification: {
    commands: string[];
  };
  notifications: {
    desktopNotify: boolean;
    audioAlert: boolean;
  };
}
