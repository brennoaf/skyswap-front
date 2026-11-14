export type LabTool = 'fov' | 'gaia' | 'wise' | 'flags' | 'pixels' | 'spectrum' | 'lightcurve' | 'notes' | 'export'

export const TOOL_UNLOCKS: Record<LabTool, number> = {
  fov: 1,
  gaia: 1,
  wise: 2,
  flags: 2,
  pixels: 3,
  spectrum: 4,
  lightcurve: 4,
  notes: 5,
  export: 6,
}

export const LAB_TOOLS = Object.keys(TOOL_UNLOCKS) as LabTool[]

export const DAILY_XP_CAP = 150

export const isToolUnlocked = (tool: LabTool, unlocked: readonly string[], expert = false) => expert || unlocked.includes(tool)
