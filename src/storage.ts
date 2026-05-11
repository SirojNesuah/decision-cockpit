import type { DecisionDraft } from './domain'

const storageKey = 'decision-cockpit.v1'
const exportDirectoryKey = 'decision-cockpit.export-directory.v1'

export function loadDecisionDraft(): DecisionDraft | null {
  const rawValue = window.localStorage.getItem(storageKey)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as DecisionDraft
  } catch {
    return null
  }
}

export function saveDecisionDraft(draft: DecisionDraft) {
  window.localStorage.setItem(storageKey, JSON.stringify(draft))
}

export function clearDecisionDraft() {
  window.localStorage.removeItem(storageKey)
}

export function loadExportDirectory() {
  return window.localStorage.getItem(exportDirectoryKey) ?? '~/Downloads'
}

export function saveExportDirectory(directory: string) {
  window.localStorage.setItem(exportDirectoryKey, directory)
}
