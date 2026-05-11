export type OptionMetrics = {
  impact: number
  confidence: number
  effort: number
  reversibility: number
}

export type DecisionOption = {
  id: string
  name: string
  summary: string
  assumptions: string[]
  risks: string[]
  tradeOffs: string[]
  metrics: OptionMetrics
}

export type DecisionDraft = {
  title: string
  prompt: string
  context: string
  assumptions: string[]
  risks: string[]
  tradeOffs: string[]
  options: DecisionOption[]
}

export type RankedOption = {
  option: DecisionOption
  totalScore: number
  factors: Array<{ label: string; value: string }>
  strengths: string[]
  cautions: string[]
  scoreBreakdown: ScoreBreakdownItem[]
  evidenceCounts: {
    assumptions: number
    risks: number
    tradeOffs: number
  }
}

export type ScoreBreakdownItem = {
  key: 'impact' | 'confidence' | 'reversibility' | 'effort' | 'assumptions' | 'risks' | 'tradeOffs'
  label: string
  weight: number
  kind: 'metric' | 'penalty'
  value: number
  contribution: number
}

export type RecommendationAudit = {
  scoringModel: Array<{
    label: string
    detail: string
  }>
  leaderGap: number | null
  comparisons: Array<{
    optionId: string
    optionName: string
    rank: number
    score: number
    gapToLeader: number
    metricProfile: string
    evidenceProfile: string
    strongestSignal: string
    biggestDrag: string
  }>
}

export type DecisionReadiness = {
  score: number
  status: 'ready' | 'forming' | 'early'
  completedChecks: number
  totalChecks: number
  signals: string[]
  openGaps: string[]
}

export const seedDecision: DecisionDraft = {
  title: 'Decision Cockpit launch shape',
  prompt: 'Which MVP path gives us the strongest first local demo within one sprint?',
  context:
    'We need a product-feeling first slice that is credible in a live walkthrough, quick to extend, and transparent about why the recommendation is chosen.',
  assumptions: [
    'The first audience cares more about coherence and clarity than raw feature count.',
    'A local-first frontend is enough for the initial review cycle.',
  ],
  risks: [
    'Over-designing the first slice could slow validation.',
    'Opaque scoring would reduce trust in the recommendation.',
  ],
  tradeOffs: [
    'Prefer explainability over algorithmic sophistication.',
    'Prefer a polished single workflow over breadth.',
  ],
  options: [
    {
      id: 'option-1',
      name: 'Local-first cockpit',
      summary: 'Ship a focused decision workflow with transparent scoring and persistence.',
      assumptions: ['Users can manually enter enough context for a strong first decision pass.'],
      risks: ['No collaboration layer yet.', 'Recommendation logic stays heuristic in v1.'],
      tradeOffs: ['Delays integrations in exchange for a stronger product core.'],
      metrics: { impact: 5, confidence: 4, effort: 3, reversibility: 4 },
    },
    {
      id: 'option-2',
      name: 'Broader but thinner dashboard',
      summary: 'Cover more screens early even if the decision logic remains lighter.',
      assumptions: ['Breadth creates confidence faster than depth.'],
      risks: ['Thin interactions may feel like a mockup.', 'Harder to explain recommendation quality.'],
      tradeOffs: ['Higher surface area now, lower product integrity in the first demo.'],
      metrics: { impact: 3, confidence: 2, effort: 4, reversibility: 3 },
    },
  ],
}

export function createEmptyOption(index: number): DecisionOption {
  return {
    id: `option-${crypto.randomUUID()}`,
    name: `Option ${index}`,
    summary: '',
    assumptions: [],
    risks: [],
    tradeOffs: [],
    metrics: { impact: 3, confidence: 3, effort: 3, reversibility: 3 },
  }
}

export function getRankedOptions(decision: DecisionDraft): RankedOption[] {
  return [...decision.options]
    .map((option) => {
      const scoreBreakdown: ScoreBreakdownItem[] = [
        toScoreBreakdown('impact', 'Impact', 1.35, 'metric', option.metrics.impact),
        toScoreBreakdown('confidence', 'Confidence', 1.15, 'metric', option.metrics.confidence),
        toScoreBreakdown(
          'reversibility',
          'Reversibility',
          0.8,
          'metric',
          option.metrics.reversibility,
        ),
        toScoreBreakdown('effort', 'Effort', -0.9, 'metric', option.metrics.effort),
        toScoreBreakdown('assumptions', 'Assumption load', -0.15, 'penalty', option.assumptions.length),
        toScoreBreakdown('risks', 'Risk load', -0.45, 'penalty', option.risks.length),
        toScoreBreakdown('tradeOffs', 'Trade-off load', -0.2, 'penalty', option.tradeOffs.length),
      ]
      const rawScore = scoreBreakdown.reduce((sum, item) => sum + item.contribution, 0)
      const totalScore = Number(rawScore.toFixed(1))

      return {
        option,
        totalScore,
        factors: [
          { label: 'Impact', value: weightedLabel(option.metrics.impact, 1.35) },
          { label: 'Confidence', value: weightedLabel(option.metrics.confidence, 1.15) },
          { label: 'Effort drag', value: weightedLabel(option.metrics.effort, -0.9) },
          {
            label: 'Risk load',
            value: `${option.risks.length} active risk${option.risks.length === 1 ? '' : 's'}`,
          },
        ],
        strengths: summarizeStrengths(option),
        cautions: summarizeCautions(option),
        scoreBreakdown,
        evidenceCounts: {
          assumptions: option.assumptions.length,
          risks: option.risks.length,
          tradeOffs: option.tradeOffs.length,
        },
      }
    })
    .sort((left, right) => right.totalScore - left.totalScore)
}

export function getRecommendationNarrative(
  decision: DecisionDraft,
  rankedOptions: RankedOption[],
): string[] {
  if (!rankedOptions.length) {
    return []
  }

  const [leader, runnerUp] = rankedOptions
  const margin = runnerUp ? Number((leader.totalScore - runnerUp.totalScore).toFixed(1)) : leader.totalScore
  const decisionRiskCount = decision.risks.length

  return [
    `${leader.option.name} leads by ${margin} points because it combines stronger impact and confidence without becoming too expensive to reverse.`,
    decisionRiskCount
      ? `The overall decision still carries ${decisionRiskCount} shared risk${decisionRiskCount === 1 ? '' : 's'}, so the recommendation favors options that stay adaptable.`
      : 'No shared decision-level risks are logged yet, so the ranking leans more heavily on the option metrics.',
    leader.option.tradeOffs.length
      ? `The main cost is ${leader.option.tradeOffs[0].toLowerCase()}.`
      : 'The top option does not have a documented trade-off yet; add one to pressure-test the recommendation.',
  ]
}

export function getScoreTone(score: number) {
  if (score >= 6.5) {
    return 'strong'
  }
  if (score >= 4.5) {
    return 'steady'
  }
  return 'watch'
}

export function getRecommendationAudit(rankedOptions: RankedOption[]): RecommendationAudit {
  const leader = rankedOptions[0]
  const runnerUp = rankedOptions[1]
  const leaderGap =
    leader && runnerUp ? Number((leader.totalScore - runnerUp.totalScore).toFixed(1)) : null

  return {
    scoringModel: [
      { label: 'Impact', detail: 'adds 1.35 points per rating step' },
      { label: 'Confidence', detail: 'adds 1.15 points per rating step' },
      { label: 'Reversibility', detail: 'adds 0.8 points per rating step' },
      { label: 'Effort', detail: 'subtracts 0.9 points per rating step' },
      { label: 'Assumptions', detail: 'subtracts 0.15 points per documented assumption' },
      { label: 'Risks', detail: 'subtracts 0.45 points per documented risk' },
      { label: 'Trade-offs', detail: 'subtracts 0.2 points per documented trade-off' },
    ],
    comparisons: rankedOptions.map((entry, index) => {
      const strongestSignal = [...entry.scoreBreakdown]
        .sort((left, right) => right.contribution - left.contribution)[0]
      const biggestDrag = [...entry.scoreBreakdown]
        .sort((left, right) => left.contribution - right.contribution)[0]

      return {
        optionId: entry.option.id,
        optionName: entry.option.name,
        rank: index + 1,
        score: entry.totalScore,
        gapToLeader: leader ? Number((leader.totalScore - entry.totalScore).toFixed(1)) : 0,
        metricProfile:
          `I${entry.option.metrics.impact} ` +
          `C${entry.option.metrics.confidence} ` +
          `E${entry.option.metrics.effort} ` +
          `R${entry.option.metrics.reversibility}`,
        evidenceProfile:
          `${entry.evidenceCounts.assumptions}A ` +
          `${entry.evidenceCounts.risks}R ` +
          `${entry.evidenceCounts.tradeOffs}T`,
        strongestSignal: `${strongestSignal.label} ${formatContribution(strongestSignal.contribution)}`,
        biggestDrag: `${biggestDrag.label} ${formatContribution(biggestDrag.contribution)}`,
      }
    }),
    leaderGap,
  }
}

export function getDecisionReadiness(decision: DecisionDraft): DecisionReadiness {
  const checks = [
    {
      done: Boolean(decision.title.trim()),
      signal: 'Decision title is set.',
      gap: 'Add a clear decision title.',
    },
    {
      done: Boolean(decision.prompt.trim()),
      signal: 'Decision prompt is captured.',
      gap: 'Write the core decision prompt.',
    },
    {
      done: Boolean(decision.context.trim()),
      signal: 'Context is documented.',
      gap: 'Add context so the recommendation has framing.',
    },
    {
      done: decision.options.length >= 2,
      signal: 'At least two options are available for comparison.',
      gap: 'Keep at least two options in play.',
    },
    {
      done: decision.options.every(
        (option) => Boolean(option.name.trim()) && Boolean(option.summary.trim()),
      ),
      signal: 'Every option has a name and summary.',
      gap: 'Complete the name and summary for each option.',
    },
    {
      done: decision.options.every(
        (option) =>
          option.assumptions.length + option.risks.length + option.tradeOffs.length > 0,
      ),
      signal: 'Each option has explicit reasoning attached.',
      gap: 'Add assumptions, risks, or trade-offs to every option.',
    },
    {
      done: decision.assumptions.length + decision.risks.length + decision.tradeOffs.length > 0,
      signal: 'Decision-level pressures are documented.',
      gap: 'Capture at least one decision-level assumption, risk, or trade-off.',
    },
  ]

  const completedChecks = checks.filter((check) => check.done).length
  const totalChecks = checks.length
  const score = Math.round((completedChecks / totalChecks) * 100)

  return {
    score,
    status: score >= 85 ? 'ready' : score >= 55 ? 'forming' : 'early',
    completedChecks,
    totalChecks,
    signals: checks.filter((check) => check.done).map((check) => check.signal),
    openGaps: checks.filter((check) => !check.done).map((check) => check.gap),
  }
}

function weightedLabel(value: number, weight: number) {
  const contribution = Number((value * Math.abs(weight)).toFixed(1))
  return weight >= 0 ? `+${contribution}` : `-${contribution}`
}

function toScoreBreakdown(
  key: ScoreBreakdownItem['key'],
  label: string,
  weight: number,
  kind: ScoreBreakdownItem['kind'],
  value: number,
): ScoreBreakdownItem {
  return {
    key,
    label,
    weight,
    kind,
    value,
    contribution: Number((value * weight).toFixed(2)),
  }
}

function formatContribution(value: number) {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2)
}

function summarizeStrengths(option: DecisionOption) {
  const strengths: string[] = []

  if (option.metrics.impact >= 4) {
    strengths.push('High expected upside if the team commits to it.')
  }
  if (option.metrics.confidence >= 4) {
    strengths.push('Evidence and belief are strong enough to move without over-explaining.')
  }
  if (option.metrics.reversibility >= 4) {
    strengths.push('The path is easier to unwind if the assumptions change.')
  }

  return strengths.length ? strengths : ['Balanced profile with no standout advantage yet.']
}

function summarizeCautions(option: DecisionOption) {
  const cautions: string[] = []

  if (option.metrics.effort >= 4) {
    cautions.push('Execution load is high and could slow learning.')
  }
  if (option.risks.length > 1) {
    cautions.push('Several risks need explicit mitigation before committing.')
  }
  if (option.assumptions.length > 1) {
    cautions.push('The recommendation depends on multiple assumptions staying true.')
  }

  return cautions.length ? cautions : ['No major caution is flagged beyond the normal trade-offs.']
}
