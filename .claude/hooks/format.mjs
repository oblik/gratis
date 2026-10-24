// PostToolUse hook: format whatever file Claude just edited, so the code on disk
// (and Claude's next edit) is always in the project's style.
import { execFileSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk
const file = JSON.parse(input).tool_input?.file_path
if (file) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'prettier',
      '--write',
      '--ignore-unknown',
      '--log-level',
      'warn',
      file,
    ],
    { cwd: process.env.CLAUDE_PROJECT_DIR, stdio: 'inherit' },
  )
}
