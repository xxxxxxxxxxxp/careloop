import { readFileSync } from 'node:fs'

// Small dependency-free loader for local development. Existing process
// variables always win, and values are never printed.
export function loadLocalEnv(path = '.env', environment = process.env) {
  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || environment[match[1]] !== undefined) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    environment[match[1]] = value
  }
  return true
}

