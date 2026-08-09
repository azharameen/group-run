import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bmad-cc': 'bin/bmad-cc.ts',
    'bin/bmad-cc': 'bin/bmad-cc.ts',
    'commands/tui': 'src/commands/tui.ts',
    'commands/run': 'src/commands/run.ts',
    'commands/status': 'src/commands/status.ts',
    'commands/doctor': 'src/commands/doctor.ts',
    'commands/resume': 'src/commands/resume.ts',
    'commands/history': 'src/commands/history.ts',
    'commands/config': 'src/commands/config.ts'
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: false,
});
