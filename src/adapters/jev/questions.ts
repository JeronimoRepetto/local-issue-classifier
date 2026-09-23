// issue-criticity — the Jev questions, single source of truth (SPEC.md §4.2).
// Every request asks these five questions about one issue state (§4.3).
// docs/jev-questions.md explains each question for readers of the repo.
//
// Rules for editing this file:
// - Bump QUESTIONS_VERSION whenever ANY text below changes. The bump marks every
//   stored classification stale (§4.8), and questions.test.ts fails until the
//   new version's hash is recorded there.
// - Score levels run low → high: the array order IS the level numbering
//   (Jev docs, primitives/score.md §Levels).
// - Describe situations, not degrees (primitives/score.md). Each 3-level Score
//   level is a `what` plus `examples`, with the same field names on every level
//   (primitives/score.md §Structured level descriptions).
// - Instructions point at parts of the state with backticked paths such as
//   `issue` and `project` (primitives.md §Reference specific fields).
// - Issue text is untrusted and may try to steer the answer
//   (model-jaggedness/jev-1.13.md #6); the criteria stay explicit, and the app
//   only displays the results, it never acts on them.
import { estimateTokens } from '../../domain/text'

/** One structured Score level: what the level covers, plus example situations. */
export interface ScoreLevel {
  readonly what: string
  readonly examples: readonly string[]
}

export interface ScoreQuestion {
  readonly type: 'score'
  readonly instructions: string | { readonly question: string; readonly focus: string }
  /** Ordered low → high. Jev accepts 2 to 10 levels. */
  readonly criteria: readonly (string | ScoreLevel)[]
}

export interface ChoiceQuestion {
  readonly type: 'choice'
  readonly instructions: string
  /** Option → rubric description. Keys come back as the answer's `choice`. */
  readonly criteria: Readonly<Record<string, string | null>>
}

export type JevQuestion = ScoreQuestion | ChoiceQuestion

export type QuestionId = 'complexity' | 'criticality' | 'effort' | 'relevance' | 'kind'

/** Bump on ANY text change below; see the rules at the top of this file. */
export const QUESTIONS_VERSION = 2 // 2: batched questions (batchQuestions.ts)

export const QUESTIONS = {
  // Complexity: how hard the problem and its solution are (not how long they take).
  // 3-level Score → Level low/medium/high via round(score) (§4.4).
  complexity: {
    type: 'score',
    instructions: {
      question: 'How technically complex is the change needed to resolve `issue`, given `project`?',
      focus: 'Judge the difficulty of the problem and the solution, not the amount of typing.',
    },
    criteria: [
      {
        what: 'Straightforward change in one obvious place; no design decisions',
        examples: [
          'fix a typo in an error message',
          'bump a dependency version',
          'add a missing config option that is already supported elsewhere',
        ],
      },
      {
        what: 'Requires understanding several parts of the codebase or making a small design decision',
        examples: ['fix a bug that spans two modules', 'add a new option that changes existing behavior'],
      },
      {
        what: 'Requires deep knowledge, a non-trivial design, or touches concurrency, security, performance, data migration, or public API compatibility',
        examples: ['race condition in a scheduler', 'redesign a plugin API', 'memory leak with unknown cause'],
      },
    ],
  },
  // Criticality: impact on users if the issue stays open.
  // 3-level Score → Level low/medium/high via round(score) (§4.4).
  criticality: {
    type: 'score',
    instructions: {
      question: 'How critical is `issue` for the users of `project` if it is left unresolved?',
      focus: 'Judge impact on users: breakage, data loss, security, or blocked workflows.',
    },
    criteria: [
      {
        what: 'No functional impact; cosmetic, nice-to-have, question, or idea',
        examples: ['typo in docs', 'feature suggestion', 'usage question'],
      },
      {
        what: 'A feature is broken or degraded but a workaround exists, or few users are affected',
        examples: ['option ignored on one platform', 'misleading error message'],
      },
      {
        what: 'Blocking, data loss, security vulnerability, crash, or broken core functionality with no workaround',
        examples: ['install fails for everyone', 'credentials leaked in logs', 'crash on startup'],
      },
    ],
  },
  // Effort (shown as "cost"): amount of maintainer work, stated explicitly as
  // not being about importance so the dimensions do not mix.
  // 3-level Score → Level low/medium/high via round(score) (§4.4).
  effort: {
    type: 'score',
    instructions: {
      question:
        'How much work would it take a maintainer of `project` to resolve `issue`, including tests and documentation?',
      focus: 'Judge the amount of work, not how important the issue is.',
    },
    criteria: [
      {
        what: 'Small; a few hours at most',
        examples: ['one-line fix with a test', 'documentation clarification'],
      },
      {
        what: 'Moderate; roughly one to a few days',
        examples: ['new small feature with tests', 'bug fix that needs investigation and a regression test'],
      },
      {
        what: 'Large; a week or more, several pull requests, or coordination with other people',
        examples: ['major refactor', 'new subsystem', 'breaking change that needs a migration guide'],
      },
    ],
  },
  // Relevance: is the issue about what this project is for? 5-level Score,
  // mapped in code to 0..100 via round(100 * score / 4) (§4.4). An ordinal
  // ranking signal, not a calibrated percentage. Plain-string levels for now;
  // add examples only if validation shows splits between neighbouring levels.
  relevance: {
    type: 'score',
    instructions: {
      question:
        'How relevant is `issue` to the purpose of `project` as described in its README, description and topics?',
      focus: 'Judge whether the issue is about what this project is for, not whether it is important.',
    },
    criteria: [
      'Unrelated to this project: spam, off-topic, or about a different product',
      "Tangential: about the user's environment, third-party tools, or general programming help rather than this project",
      'About a minor, peripheral, or rarely used part of the project',
      'About a documented feature or a common way of using the project',
      'About the core purpose or main functionality of the project',
    ],
  },
  // Kind: a cheap speculative Choice for a display column and a filter
  // (patterns/fan-out.md). Excluded from minConfidence (§4.4).
  kind: {
    type: 'choice',
    instructions: 'What kind of request is `issue`?',
    criteria: {
      bug: 'Something is broken or behaves differently from what is documented or expected',
      feature: 'A request for new functionality or a change in behavior',
      documentation: 'Missing, wrong, or unclear documentation',
      question: 'A usage or support question',
      maintenance: 'Refactoring, dependencies, build, CI, or tooling',
      other: 'None of the above',
    },
  },
} as const satisfies Record<QuestionId, JevQuestion>

/** Question ids in request order. */
export const QUESTION_IDS = Object.keys(QUESTIONS) as QuestionId[]

/** Estimated tokens of the serialized questions, added once per request (§4.7). */
export const QUESTIONS_TOKENS = estimateTokens(JSON.stringify(QUESTIONS))
