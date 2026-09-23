// local-issue-classifier — the Jev questions of a batched request (docs/batching.md).
// Derived from QUESTIONS (questions.ts, the single source of truth): the same
// criteria, with each instruction pointed at one issue of the composite state
// by index and id, e.g. "`issues[3]` (the issue with id #123)". Ids are
// namespaced per issue (`c_123`, `k_123`, `e_123`, `r_123`, `t_123`) so the
// answers split back per issue (domain/classification.ts).
//
// Questions cannot read each other (concepts/state.md), so issue text lives only
// in the state, never in an instruction. Changing the template below changes
// the question text: bump QUESTIONS_VERSION (questions.test.ts guards it).
import { ANSWER_DIMENSIONS, batchAnswerId, type AnswerDimension } from '../../domain/classification'
import type { QuestionBudget } from '../../domain/jevBatchState'
import { batchIssueId } from '../../domain/jevBatchState'
import { estimateTokens } from '../../domain/text'
import { QUESTIONS, type JevQuestion } from './questions'

/** The per-issue questions name the state's `issue`; a batch names one entry of `issues`. */
const ISSUE_REF = '`issue`'

const refFor = (index: number, issueNumber: number) =>
  `\`issues[${index}]\` (the issue with id ${batchIssueId(issueNumber)})`

function retarget(question: JevQuestion, ref: string): JevQuestion {
  const point = (text: string) => text.split(ISSUE_REF).join(ref)
  if (question.type === 'choice') return { ...question, instructions: point(question.instructions) }
  const { instructions } = question
  return {
    ...question,
    instructions: typeof instructions === 'string' ? point(instructions) : { ...instructions, question: point(instructions.question) },
  }
}

/** The five questions for the issue at `index` of the composite state's `issues`. */
export function batchQuestionsFor(index: number, issueNumber: number): Record<string, JevQuestion> {
  const ref = refFor(index, issueNumber)
  return Object.fromEntries(
    ANSWER_DIMENSIONS.map((dimension: AnswerDimension) => [
      batchAnswerId(dimension, issueNumber),
      retarget(QUESTIONS[dimension], ref),
    ]),
  )
}

/** Every question of a batch, issues in the same order as the state's `issues`. */
export function batchQuestions(issueNumbers: readonly number[]): Record<string, JevQuestion> {
  return Object.assign({}, ...issueNumbers.map((n, i) => batchQuestionsFor(i, n)))
}

// Upper bound: the widest index and id a realistic batch can carry.
const WIDEST = batchQuestionsFor(9_999, 9_999_999)

/** What the fitter (domain/jevBatchState.ts) budgets per issue and for the longest question. */
export const BATCH_QUESTION_BUDGET: QuestionBudget = {
  perIssueTokens: estimateTokens(JSON.stringify(WIDEST)),
  longestQuestionTokens: Math.max(...Object.values(WIDEST).map((q) => estimateTokens(JSON.stringify(q)))),
}
