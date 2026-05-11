import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  type DecisionReadiness,
  type DecisionDraft,
  type DecisionOption,
  createEmptyOption,
  getDecisionReadiness,
  getRecommendationAudit,
  getRecommendationNarrative,
  getRankedOptions,
  getScoreTone,
  seedDecision,
} from './domain'
import {
  clearDecisionDraft,
  loadDecisionDraft,
  loadExportDirectory,
  saveDecisionDraft,
  saveExportDirectory,
} from './storage'

const decisionFields: Array<{
  key: keyof Pick<DecisionDraft, 'assumptions' | 'risks' | 'tradeOffs'>
  label: string
  hint: string
}> = [
  {
    key: 'assumptions',
    label: 'Core assumptions',
    hint: 'What must stay true for this decision to hold?',
  },
  {
    key: 'risks',
    label: 'Decision-level risks',
    hint: 'Shared downsides that could hit every option.',
  },
  {
    key: 'tradeOffs',
    label: 'Decision trade-offs',
    hint: 'What are you willing to sacrifice to move quickly?',
  },
]

const optionFields: Array<{
  key: keyof Pick<DecisionOption, 'assumptions' | 'risks' | 'tradeOffs'>
  label: string
}> = [
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'risks', label: 'Risks' },
  { key: 'tradeOffs', label: 'Trade-offs' },
]

const metricFields: Array<{
  key: keyof DecisionOption['metrics']
  label: string
  low: string
  high: string
}> = [
  { key: 'impact', label: 'Impact', low: 'Limited', high: 'Transformative' },
  { key: 'confidence', label: 'Confidence', low: 'Fragile', high: 'Backed' },
  { key: 'effort', label: 'Effort', low: 'Light', high: 'Heavy' },
  { key: 'reversibility', label: 'Reversibility', low: 'Sticky', high: 'Easy undo' },
]

type LocalBridgeStatus = {
  available: boolean
  platform: string
  workspaceRoot: string
  exportDirectory: string
  macOpenSupported: boolean
}

function App() {
  const [draft, setDraft] = useState<DecisionDraft>(() => loadDecisionDraft() ?? seedDecision)
  const [activeOptionId, setActiveOptionId] = useState<string>(draft.options[0]?.id ?? '')
  const [exportDirectory, setExportDirectory] = useState(() => loadExportDirectory())
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [bridgeStatus, setBridgeStatus] = useState<LocalBridgeStatus | null>(null)
  const [localBridgeMessage, setLocalBridgeMessage] = useState<string>('')
  const [localActionBusy, setLocalActionBusy] = useState(false)
  const [lastLocalExportPath, setLastLocalExportPath] = useState<string>('')

  useEffect(() => {
    saveDecisionDraft(draft)
  }, [draft])

  useEffect(() => {
    saveExportDirectory(exportDirectory)
  }, [exportDirectory])

  useEffect(() => {
    let cancelled = false

    const loadBridgeStatus = async () => {
      try {
        const response = await fetch('/api/local/status')
        if (!response.ok) {
          return
        }

        const status = (await response.json()) as LocalBridgeStatus
        if (!cancelled) {
          setBridgeStatus(status)
        }
      } catch {
        if (!cancelled) {
          setBridgeStatus(null)
        }
      }
    }

    void loadBridgeStatus()

    return () => {
      cancelled = true
    }
  }, [])

  const rankedOptions = useMemo(() => getRankedOptions(draft), [draft])
  const recommendationAudit = useMemo(() => getRecommendationAudit(rankedOptions), [rankedOptions])
  const readiness = useMemo<DecisionReadiness>(() => getDecisionReadiness(draft), [draft])
  const topOption = rankedOptions[0]
  const recommendation = useMemo(
    () => getRecommendationNarrative(draft, rankedOptions),
    [draft, rankedOptions],
  )
  const exportFileName = `${toSlug(draft.title || 'decision-cockpit')}.json`
  const exportPath = joinMacPath(exportDirectory, exportFileName)
  const workspaceExportPath = bridgeStatus
    ? joinMacPath(bridgeStatus.exportDirectory, exportFileName)
    : ''
  const resolvedActiveOptionId = draft.options.some((option) => option.id === activeOptionId)
    ? activeOptionId
    : (draft.options[0]?.id ?? '')
  const activeOption =
    draft.options.find((option) => option.id === resolvedActiveOptionId) ?? draft.options[0]

  const updateDraft = <K extends keyof DecisionDraft>(key: K, value: DecisionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updateOption = (optionId: string, updater: (option: DecisionOption) => DecisionOption) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.id === optionId ? updater(option) : option,
      ),
    }))
  }

  const addOption = () => {
    const option = createEmptyOption(draft.options.length + 1)
    setDraft((current) => ({ ...current, options: [...current.options, option] }))
    setActiveOptionId(option.id)
  }

  const removeOption = (optionId: string) => {
    if (draft.options.length <= 2) {
      return
    }

    setDraft((current) => ({
      ...current,
      options: current.options.filter((option) => option.id !== optionId),
    }))
  }

  const restoreSeedDecision = () => {
    setDraft(seedDecision)
    setActiveOptionId(seedDecision.options[0]?.id ?? '')
  }

  const resetDecision = () => {
    clearDecisionDraft()
    restoreSeedDecision()
  }

  const exportDecision = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        decision: draft,
        recommendation: {
          rankedOptions,
          narrative: recommendation,
          audit: recommendationAudit,
          readiness,
        },
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = exportFileName
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const copyCommand = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedCommand(label)
      window.setTimeout(() => setCopiedCommand((current) => (current === label ? null : current)), 1800)
    } catch {
      setCopiedCommand(`Copy failed for ${label}`)
    }
  }

  const runLocalBridgeAction = async (mode: 'save' | 'inspect' | 'reveal') => {
    if (!bridgeStatus) {
      return
    }

    setLocalActionBusy(true)
    setLocalBridgeMessage('')

    try {
      const exportResponse = await fetch('/api/local/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: exportFileName, payload: draft }),
      })
      const exportResult = (await exportResponse.json()) as { filePath?: string; error?: string }

      if (!exportResponse.ok || !exportResult.filePath) {
        throw new Error(exportResult.error || 'Local export failed.')
      }

      setLastLocalExportPath(exportResult.filePath)

      if (mode === 'save') {
        setLocalBridgeMessage(`Saved to ${exportResult.filePath}`)
        return
      }

      const openResponse = await fetch('/api/local/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: exportResult.filePath, mode }),
      })
      const openResult = (await openResponse.json()) as { error?: string }

      if (!openResponse.ok) {
        throw new Error(openResult.error || 'Local open failed.')
      }

      setLocalBridgeMessage(
        mode === 'inspect'
          ? `Quick Look opened for ${exportResult.filePath}`
          : `Finder reveal triggered for ${exportResult.filePath}`,
      )
    } catch (error) {
      setLocalBridgeMessage(error instanceof Error ? error.message : 'Local bridge action failed.')
    } finally {
      setLocalActionBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Decision Cockpit MVP</p>
          <h1>Turn a messy decision into a transparent recommendation.</h1>
          <p className="hero-body">
            Capture the prompt, compare options, surface trade-offs, and keep a
            runnable local-first artifact that survives refreshes.
          </p>
        </div>
        <div className="hero-stats" aria-label="Decision summary">
          <div>
            <span>Options</span>
            <strong>{draft.options.length}</strong>
          </div>
          <div>
            <span>Top signal</span>
            <strong>{topOption ? `${topOption.option.name} ${topOption.totalScore}` : 'Pending'}</strong>
          </div>
          <div>
            <span>Readiness</span>
            <strong>{readiness.score}%</strong>
          </div>
          <div>
            <span>Coverage</span>
            <strong>
              {readiness.completedChecks}/{readiness.totalChecks} checks
            </strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel editor-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Decision framing</p>
              <h2>Define the decision</h2>
            </div>
            <span className="status-pill">Auto-saved locally</span>
          </div>

          <div className="toolbar-row" aria-label="Decision actions">
            <button type="button" className="ghost-button" onClick={restoreSeedDecision}>
              Load demo
            </button>
            <button type="button" className="ghost-button" onClick={exportDecision}>
              Download JSON
            </button>
            <button type="button" className="danger-button" onClick={resetDecision}>
              Reset local state
            </button>
          </div>

          <div className="local-handoff" aria-label="Local Mac handoff">
            <div className="local-handoff-heading">
              <div>
                <p className="section-label">Local Mac handoff</p>
                <h3>Inspect or reveal the exported file directly</h3>
              </div>
              <span className="status-pill">
                {bridgeStatus ? 'local workspace bridge' : 'macOS shell fallback'}
              </span>
            </div>

            {bridgeStatus ? (
              <>
                <div className="path-card">
                  <span className="section-label">Workspace export path</span>
                  <code>{lastLocalExportPath || workspaceExportPath}</code>
                </div>

                <div className="command-grid">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void runLocalBridgeAction('save')}
                    disabled={localActionBusy}
                  >
                    Save in workspace
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void runLocalBridgeAction('inspect')}
                    disabled={localActionBusy || !bridgeStatus.macOpenSupported}
                  >
                    Inspect locally
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void runLocalBridgeAction('reveal')}
                    disabled={localActionBusy || !bridgeStatus.macOpenSupported}
                  >
                    Reveal in Finder
                  </button>
                </div>

                <p className="fine-print">
                  The local dev server writes the latest JSON into the workspace before opening it.
                  {localBridgeMessage ? ` ${localBridgeMessage}` : ''}
                </p>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Local export directory</span>
                  <input
                    value={exportDirectory}
                    onChange={(event) => setExportDirectory(event.target.value)}
                    placeholder="~/Downloads"
                  />
                </label>

                <div className="path-card">
                  <span className="section-label">Expected export path</span>
                  <code>{exportPath}</code>
                </div>

                <div className="command-grid">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => copyCommand('path', exportPath)}
                  >
                    Copy path
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => copyCommand('inspect', `qlmanage -p ${quoteShellPath(exportPath)}`)}
                  >
                    Copy inspect command
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => copyCommand('reveal', `open -R ${quoteShellPath(exportPath)}`)}
                  >
                    Copy Finder reveal
                  </button>
                </div>

                <p className="fine-print">
                  Download JSON first, then run the copied command in Terminal on your Mac.
                  {copiedCommand ? ` ${copiedCommand}.` : ''}
                </p>
              </>
            )}
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Decision title</span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder="Choose a path"
              />
            </label>
            <label className="field">
              <span>Decision prompt</span>
              <input
                value={draft.prompt}
                onChange={(event) => updateDraft('prompt', event.target.value)}
                placeholder="What are we deciding?"
              />
            </label>
          </div>

          <label className="field">
            <span>Context</span>
            <textarea
              value={draft.context}
              onChange={(event) => updateDraft('context', event.target.value)}
              rows={4}
              placeholder="What makes this decision urgent, sensitive, or strategic?"
            />
          </label>

          <div className="stacked-fields">
            {decisionFields.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  value={draft[field.key].join('\n')}
                  onChange={(event) => updateDraft(field.key, toList(event.target.value))}
                  rows={3}
                  placeholder={field.hint}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="panel options-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Option design</p>
              <h2>Model candidate paths</h2>
            </div>
            <button type="button" className="ghost-button" onClick={addOption}>
              Add option
            </button>
          </div>

          <div className="option-tabs" role="tablist" aria-label="Decision options">
            {draft.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={activeOption?.id === option.id}
                className={option.id === activeOption?.id ? 'option-tab active' : 'option-tab'}
                onClick={() => setActiveOptionId(option.id)}
              >
                <span>{option.name || 'Untitled option'}</span>
                <small>{option.summary || 'Add summary'}</small>
              </button>
            ))}
          </div>

          {activeOption ? (
            <div className="option-editor">
              <div className="field-grid">
                <label className="field">
                  <span>Option name</span>
                  <input
                    value={activeOption.name}
                    onChange={(event) =>
                      updateOption(activeOption.id, (option) => ({
                        ...option,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Option summary</span>
                  <input
                    value={activeOption.summary}
                    onChange={(event) =>
                      updateOption(activeOption.id, (option) => ({
                        ...option,
                        summary: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="metrics-grid">
                {metricFields.map((metric) => (
                  <label className="metric-card" key={metric.key}>
                    <span>{metric.label}</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={activeOption.metrics[metric.key]}
                      onChange={(event) =>
                        updateOption(activeOption.id, (option) => ({
                          ...option,
                          metrics: {
                            ...option.metrics,
                            [metric.key]: Number(event.target.value),
                          },
                        }))
                      }
                    />
                    <strong>{activeOption.metrics[metric.key]}</strong>
                    <small>
                      {metric.low} to {metric.high}
                    </small>
                  </label>
                ))}
              </div>

              <div className="stacked-fields">
                {optionFields.map((field) => (
                  <label className="field" key={field.key}>
                    <span>{field.label}</span>
                    <textarea
                      value={activeOption[field.key].join('\n')}
                      onChange={(event) =>
                        updateOption(activeOption.id, (option) => ({
                          ...option,
                          [field.key]: toList(event.target.value),
                        }))
                      }
                      rows={3}
                    />
                  </label>
                ))}
              </div>

              <div className="option-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => removeOption(activeOption.id)}
                  disabled={draft.options.length <= 2}
                >
                  Remove option
                </button>
                {draft.options.length <= 2 ? (
                  <span className="fine-print">Keep at least two options to preserve comparison.</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel insight-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Recommendation</p>
              <h2>Explain the rank order</h2>
            </div>
          </div>

          <div className="snapshot-grid">
            <article className="snapshot-card">
              <span className="section-label">Cockpit readiness</span>
              <strong>{readiness.score}%</strong>
              <p>
                {readiness.status === 'ready'
                  ? 'The decision is well-framed enough for a confident walkthrough.'
                  : readiness.status === 'forming'
                    ? 'The structure is usable, but a few gaps still weaken the recommendation.'
                    : 'The recommendation is still early and needs more explicit framing.'}
              </p>
            </article>
            <article className="snapshot-card">
              <span className="section-label">Decision pressure</span>
              <strong>{draft.risks.length + draft.tradeOffs.length}</strong>
              <p>Shared risks and trade-offs logged at the decision level.</p>
            </article>
          </div>

          {topOption ? (
            <div className="recommendation-card">
              <div className="recommendation-header">
                <div>
                  <span className="section-label">Recommended now</span>
                  <h3>{topOption.option.name}</h3>
                </div>
                <span className={`score-chip ${getScoreTone(topOption.totalScore)}`}>
                  Score {topOption.totalScore}
                </span>
              </div>
              <p>{topOption.option.summary}</p>
              <ul className="signal-list">
                {recommendation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="audit-board">
            <article className="audit-card">
              <div className="panel-heading compact">
                <div>
                  <p className="section-label">Audit trail</p>
                  <h3>How the score is built</h3>
                </div>
                <span className="status-pill">Deterministic</span>
              </div>
              <ul className="audit-model-list">
                {recommendationAudit.scoringModel.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="audit-card">
              <div className="panel-heading compact">
                <div>
                  <p className="section-label">Comparison</p>
                  <h3>Directly compare the candidates</h3>
                </div>
                <span className="status-pill">
                  {recommendationAudit.leaderGap !== null
                    ? `Leader gap ${recommendationAudit.leaderGap}`
                    : 'Single option'}
                </span>
              </div>
              <div className="comparison-table" role="table" aria-label="Recommendation comparison">
                <div className="comparison-row comparison-head" role="row">
                  <span role="columnheader">Option</span>
                  <span role="columnheader">Score</span>
                  <span role="columnheader">Gap</span>
                  <span role="columnheader">Metrics</span>
                  <span role="columnheader">Evidence</span>
                  <span role="columnheader">Best signal</span>
                  <span role="columnheader">Biggest drag</span>
                </div>
                {recommendationAudit.comparisons.map((item) => (
                  <div className="comparison-row" role="row" key={item.optionId}>
                    <span role="cell">
                      #{item.rank} {item.optionName}
                    </span>
                    <strong role="cell">{item.score}</strong>
                    <span role="cell">{item.gapToLeader === 0 ? 'Leader' : `-${item.gapToLeader}`}</span>
                    <span role="cell">{item.metricProfile}</span>
                    <span role="cell">{item.evidenceProfile}</span>
                    <span role="cell">{item.strongestSignal}</span>
                    <span role="cell">{item.biggestDrag}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="readiness-board">
            <div className="readiness-column">
              <span className="section-label">Ready signals</span>
              <ul className="signal-list">
                {readiness.signals.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="readiness-column">
              <span className="section-label">Open gaps</span>
              <ul className="signal-list">
                {readiness.openGaps.length ? (
                  readiness.openGaps.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>No critical framing gaps remain.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="ranking-list">
            {rankedOptions.map((entry, index) => (
              <article className="ranking-card" key={entry.option.id}>
                <div className="ranking-header">
                  <div>
                    <span className="rank-index">#{index + 1}</span>
                    <h3>{entry.option.name}</h3>
                  </div>
                  <span className={`score-chip ${getScoreTone(entry.totalScore)}`}>
                    {entry.totalScore}
                  </span>
                </div>
                <p>{entry.option.summary}</p>
                <dl className="factor-grid">
                  {entry.factors.map((factor) => (
                    <div key={factor.label}>
                      <dt>{factor.label}</dt>
                      <dd>{factor.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="breakdown-grid" aria-label={`${entry.option.name} score breakdown`}>
                  {entry.scoreBreakdown.map((item) => (
                    <div key={item.key}>
                      <dt>{item.label}</dt>
                      <dd>{formatBreakdownValue(item.value, item.weight, item.contribution)}</dd>
                    </div>
                  ))}
                </div>
                <div className="reason-columns">
                  <div>
                    <span>Why it scores well</span>
                    <ul>
                      {entry.strengths.map((strength) => (
                        <li key={strength}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span>Watchouts</span>
                    <ul>
                      {entry.cautions.map((caution) => (
                        <li key={caution}>{caution}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function toList(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function joinMacPath(directory: string, fileName: string) {
  return `${directory.replace(/\/+$/g, '')}/${fileName}`
}

function quoteShellPath(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function formatBreakdownValue(value: number, weight: number, contribution: number) {
  const sign = contribution >= 0 ? '+' : ''
  return `${value} x ${weight} = ${sign}${contribution.toFixed(2)}`
}

export default App
