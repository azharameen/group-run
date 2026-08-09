/**
 * Cyberpunk Command Center — Central Design Token File
 * All TUI components import colors and styles from here.
 */

export const THEME = {
  // ── Border colors ──────────────────────────────────────────────
  focusBorder: 'cyan' as const,
  idleBorder: 'gray' as const,
  activeBorder: 'yellow' as const,
  monitorBorder: 'magenta' as const,
  successBorder: 'green' as const,
  errorBorder: 'red' as const,

  // ── Text colors ────────────────────────────────────────────────
  heading: 'cyan' as const,
  subheading: 'white' as const,
  muted: 'gray' as const,
  accent: 'yellow' as const,
  success: 'green' as const,
  error: 'red' as const,
  info: 'cyan' as const,
  highlight: 'magenta' as const,
  userChat: 'cyan' as const,
  agentChat: 'magenta' as const,

  // ── Status badge definitions ───────────────────────────────────
  statusColor: (status: string): 'green' | 'yellow' | 'cyan' | 'gray' | 'blue' => {
    switch (status) {
      case 'done':           return 'green';
      case 'in-progress':   return 'yellow';
      case 'review':         return 'cyan';
      case 'ready-for-dev': return 'blue';
      default:               return 'gray';
    }
  },

  statusIcon: (status: string): string => {
    switch (status) {
      case 'done':           return '✔';
      case 'in-progress':   return '⚡';
      case 'review':         return '🔍';
      case 'ready-for-dev': return '▶';
      default:               return '○';
    }
  },

  // ── Phase badge definitions ────────────────────────────────────
  phaseColor: (phase: string): 'yellow' | 'cyan' | 'magenta' | 'green' | 'gray' => {
    switch (phase) {
      case 'develop':       return 'yellow';
      case 'review':         return 'cyan';
      case 'gate':           return 'magenta';
      case 'done':           return 'green';
      default:               return 'gray';
    }
  },

  phaseLabel: (phase: string): string => {
    switch (phase) {
      case 'develop':       return '⚡ DEV';
      case 'review':         return '🔍 REVIEW';
      case 'gate':           return '🚦 GATE';
      case 'done':           return '✔ DONE';
      default:               return '💤 IDLE';
    }
  },

  // ── Log line color classification ──────────────────────────────
  logLineColor: (line: string): 'cyan' | 'yellow' | 'magenta' | 'green' | 'red' | 'white' => {
    if (line.startsWith('[DRIVER INIT]')) return 'cyan';
    if (line.startsWith('[PROMPT LOG]') || line.startsWith('[PROMPT]')) return 'yellow';
    if (line.startsWith('[TEST PASSED]') || line.startsWith('[GATE] APPROVE')) return 'green';
    if (line.startsWith('[TEST FAILED]') || line.startsWith('[GATE] ESCALATE')) return 'red';
    if (line.startsWith('[GATE]')) return 'magenta';
    if (line.startsWith('[STDERR]') || line.toLowerCase().includes('error')) return 'red';
    return 'white';
  }
} as const;
