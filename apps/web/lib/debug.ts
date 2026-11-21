// Debug tools (e.g. the /search test page) are off unless DEBUG_TOOLS=true is set in
// apps/web/.env.local. Server-only: never read this in a Client Component.
// Keep it off in any deployed environment; the real pages replace the debug ones as they're built.
export function debugToolsEnabled(): boolean {
  return process.env.DEBUG_TOOLS === "true";
}
