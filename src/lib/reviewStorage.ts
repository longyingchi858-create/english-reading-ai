import type {
  AnswerSource,
  GradingStatus,
  ReadingResult,
} from "@/types/reading";

export type CommonDefinition = {
  part_of_speech: string;
  meanings: string[];
};

export type SavedReadingRecord = {
  id: string;
  createdAt: string;
  title: string;
  result: ReadingResult;
};

export type SavedSentence = {
  id: string;
  text: string;
  translation: string;
  paragraphId: string;
  createdAt: string;
};

export type SavedWordContext = {
  id: string;
  paragraphId: string;
  partOfSpeech: string;
  meaning: string;
  sourceSentence: string;
  createdAt: string;
};

export type SavedWord = {
  id: string;
  word: string;
  lemma: string;
  phonetic: string;
  commonDefinitions: CommonDefinition[];
  contexts: SavedWordContext[];
  createdAt: string;
  updatedAt: string;
};

export type WordReviewStatus =
  | "reviewing"
  | "mastered";

export type WordReviewStatusRecord = {
  status: WordReviewStatus;
  updatedAt: string;
};

export type WordReviewStatusStore = Record<
  string,
  WordReviewStatusRecord
>;

export type ReasoningVerdict =
  | "correct_but_answer_mistake"
  | "partially_correct"
  | "incorrect"
  | "insufficient_information";

export type ReasoningErrorTag =
  | "detail_mislocation"
  | "question_focus_reversal"
  | "scope_expansion"
  | "causal_reversal"
  | "inference_overreach"
  | "vocabulary_misread"
  | "option_interference"
  | "logic_break"
  | "unknown";

export type ReasoningReviewResult = {
  reasoning_verdict: ReasoningVerdict;
  reasoning_summary: string;
  correct_part: string;
  key_error: string;
  error_tag: ReasoningErrorTag;
  correct_reasoning: string[];
  correction: string;
};

export type SavedReasoningReview = {
  questionId: string;
  userReasoning: string;
  result: ReasoningReviewResult;
  createdAt: string;
  updatedAt: string;
};

export type SentenceCollectionStore = Record<
  string,
  SavedSentence[]
>;

export type WordCollectionStore = Record<
  string,
  SavedWord[]
>;

export type ReasoningReviewStore = Record<
  string,
  Record<string, SavedReasoningReview>
>;

export type SentenceReviewItem = {
  readingId: string;
  readingTitle: string;
  sentence: SavedSentence;
};

export type WordReviewSource = {
  readingId: string;
  readingTitle: string;
  originalWord: string;
  contexts: SavedWordContext[];
};

export type AggregatedWordReviewItem = {
  lemma: string;
  phonetic: string;
  commonDefinitions: CommonDefinition[];
  sources: WordReviewSource[];
  firstSavedAt: string;
  lastUpdatedAt: string;
  reviewStatus: WordReviewStatus;
  statusUpdatedAt: string;
};

export type ReasoningReviewItem = {
  readingId: string;
  readingTitle: string;
  recordCreatedAt: string;
  questionId: string;
  questionNumber: number;
  questionStem: string;
  correctAnswer: string;
  userAnswer: string;
  answerSource: AnswerSource;
  answerConfidence: number | null;
  gradingStatus: GradingStatus;
  questionAnalysis: string;
  evidenceQuote: string;
  evidenceTranslation: string;
  errorTags: string[];
  review: SavedReasoningReview | null;
};

export const HISTORY_STORAGE_KEY =
  "readmate-reading-history-v1";

export const ACTIVE_RESULT_STORAGE_KEY =
  "readmate-active-result-id-v1";

export const ACTIVE_QUESTION_STORAGE_KEY =
  "readmate-active-question-id-v1";

export const SENTENCE_COLLECTION_STORAGE_KEY =
  "readmate-sentence-collections-v1";

export const WORD_COLLECTION_STORAGE_KEY =
  "readmate-word-collections-v1";

export const WORD_REVIEW_STATUS_STORAGE_KEY =
  "readmate-word-review-status-v1";

export const REASONING_REVIEW_STORAGE_KEY =
  "readmate-reasoning-reviews-v1";

export const DISMISSED_MISTAKES_STORAGE_KEY =
  "readmate-dismissed-mistakes-v1";

export const MAX_HISTORY_COUNT = 10;

function hasBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function readStorageJson(
  key: string,
): unknown {
  if (!hasBrowserStorage()) {
    return null;
  }

  try {
    const text = window.localStorage.getItem(key);

    if (!text) {
      return null;
    }

    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function writeStorageJson(
  key: string,
  value: unknown,
): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(
    key,
    JSON.stringify(value),
  );
}

function isCommonDefinition(
  value: unknown,
): value is CommonDefinition {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.part_of_speech === "string" &&
      Array.isArray(value.meanings) &&
      value.meanings.every(
        (meaning) => typeof meaning === "string",
      ),
  );
}

function isSavedSentence(
  value: unknown,
): value is SavedSentence {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      typeof value.text === "string" &&
      typeof value.translation === "string" &&
      typeof value.paragraphId === "string" &&
      typeof value.createdAt === "string",
  );
}

function isSavedWordContext(
  value: unknown,
): value is SavedWordContext {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      typeof value.paragraphId === "string" &&
      typeof value.partOfSpeech === "string" &&
      typeof value.meaning === "string" &&
      typeof value.sourceSentence === "string" &&
      typeof value.createdAt === "string",
  );
}

function isSavedWord(
  value: unknown,
): value is SavedWord {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      typeof value.word === "string" &&
      typeof value.lemma === "string" &&
      typeof value.phonetic === "string" &&
      Array.isArray(value.commonDefinitions) &&
      value.commonDefinitions.every(
        isCommonDefinition,
      ) &&
      Array.isArray(value.contexts) &&
      value.contexts.every(isSavedWordContext) &&
      typeof value.createdAt === "string" &&
      typeof value.updatedAt === "string",
  );
}

function isWordReviewStatus(
  value: unknown,
): value is WordReviewStatus {
  return ["reviewing", "mastered"].includes(
    String(value),
  );
}

function isWordReviewStatusRecord(
  value: unknown,
): value is WordReviewStatusRecord {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    isWordReviewStatus(value.status) &&
      typeof value.updatedAt === "string",
  );
}

function isReasoningVerdict(
  value: unknown,
): value is ReasoningVerdict {
  return [
    "correct_but_answer_mistake",
    "partially_correct",
    "incorrect",
    "insufficient_information",
  ].includes(String(value));
}

function isReasoningErrorTag(
  value: unknown,
): value is ReasoningErrorTag {
  return [
    "detail_mislocation",
    "question_focus_reversal",
    "scope_expansion",
    "causal_reversal",
    "inference_overreach",
    "vocabulary_misread",
    "option_interference",
    "logic_break",
    "unknown",
  ].includes(String(value));
}

function isReasoningReviewResult(
  value: unknown,
): value is ReasoningReviewResult {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    isReasoningVerdict(value.reasoning_verdict) &&
      typeof value.reasoning_summary === "string" &&
      typeof value.correct_part === "string" &&
      typeof value.key_error === "string" &&
      isReasoningErrorTag(value.error_tag) &&
      Array.isArray(value.correct_reasoning) &&
      value.correct_reasoning.every(
        (step) => typeof step === "string",
      ) &&
      typeof value.correction === "string",
  );
}

function isSavedReasoningReview(
  value: unknown,
): value is SavedReasoningReview {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.questionId === "string" &&
      typeof value.userReasoning === "string" &&
      isReasoningReviewResult(value.result) &&
      typeof value.createdAt === "string" &&
      typeof value.updatedAt === "string",
  );
}

function isSavedReadingRecord(
  value: unknown,
): value is SavedReadingRecord {
  if (!isObjectRecord(value)) {
    return false;
  }

  const result = value.result;

  if (!isObjectRecord(result)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      typeof value.createdAt === "string" &&
      typeof value.title === "string" &&
      isObjectRecord(result.article) &&
      isObjectRecord(result.summary) &&
      Array.isArray(result.questions),
  );
}

function normalizeLemma(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function safeTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function readWordReviewStatusStore():
  WordReviewStatusStore {
  const parsed = readStorageJson(
    WORD_REVIEW_STATUS_STORAGE_KEY,
  );

  if (!isObjectRecord(parsed)) {
    return {};
  }

  const store: WordReviewStatusStore = {};

  Object.entries(parsed).forEach(
    ([lemma, value]) => {
      if (isWordReviewStatusRecord(value)) {
        store[normalizeLemma(lemma)] = value;
      }
    },
  );

  return store;
}

export function writeWordReviewStatusStore(
  store: WordReviewStatusStore,
): void {
  writeStorageJson(
    WORD_REVIEW_STATUS_STORAGE_KEY,
    store,
  );
}

export function updateWordReviewStatus(
  lemma: string,
  status: WordReviewStatus,
): WordReviewStatusRecord {
  const lemmaKey = normalizeLemma(lemma);

  if (!lemmaKey) {
    throw new Error("单词不能为空。");
  }

  const record: WordReviewStatusRecord = {
    status,
    updatedAt: new Date().toISOString(),
  };

  const store = readWordReviewStatusStore();

  store[lemmaKey] = record;
  writeWordReviewStatusStore(store);

  return record;
}

export function deleteWordReviewStatus(
  lemma: string,
): void {
  const lemmaKey = normalizeLemma(lemma);
  const store = readWordReviewStatusStore();

  if (!(lemmaKey in store)) {
    return;
  }

  delete store[lemmaKey];
  writeWordReviewStatusStore(store);
}

export function getRecordTitle(
  result: ReadingResult,
): string {
  const title = result.article.title?.trim();

  if (title && title !== "Reading Passage") {
    return title;
  }

  const firstParagraph =
    result.article.paragraphs[0]?.original
      ?.replace(/\s+/g, " ")
      .trim() ?? "";

  if (!firstParagraph) {
    return "英语阅读解析";
  }

  return firstParagraph.length > 58
    ? `${firstParagraph.slice(0, 58)}...`
    : firstParagraph;
}

export function formatSavedDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function readSavedHistory(): SavedReadingRecord[] {
  const parsed = readStorageJson(
    HISTORY_STORAGE_KEY,
  );

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(isSavedReadingRecord)
    .sort(
      (left, right) =>
        safeTimestamp(right.createdAt) -
        safeTimestamp(left.createdAt),
    )
    .slice(0, MAX_HISTORY_COUNT);
}

export function writeSavedHistory(
  history: SavedReadingRecord[],
): void {
  writeStorageJson(
    HISTORY_STORAGE_KEY,
    history.slice(0, MAX_HISTORY_COUNT),
  );
}

export function upsertSavedReading(
  result: ReadingResult,
  createdAt = new Date().toISOString(),
): SavedReadingRecord[] {
  const currentHistory = readSavedHistory();

  const record: SavedReadingRecord = {
    id: result.id,
    createdAt,
    title: getRecordTitle(result),
    result,
  };

  const nextHistory = [
    record,
    ...currentHistory.filter(
      (item) => item.id !== result.id,
    ),
  ].slice(0, MAX_HISTORY_COUNT);

  writeSavedHistory(nextHistory);
  return nextHistory;
}

export function deleteSavedReading(
  resultId: string,
): SavedReadingRecord[] {
  const nextHistory = readSavedHistory().filter(
    (record) => record.id !== resultId,
  );

  writeSavedHistory(nextHistory);
  deleteSavedSentences(resultId);
  deleteSavedWords(resultId);
  deleteSavedReasoningReviews(resultId);
  clearDismissedMistakesForReading(resultId);

  if (readActiveResultId() === resultId) {
    clearActiveResultId();
  }

  return nextHistory;
}

export function readActiveResultId(): string | null {
  if (!hasBrowserStorage()) {
    return null;
  }

  const value = window.localStorage.getItem(
    ACTIVE_RESULT_STORAGE_KEY,
  );

  return value?.trim() || null;
}

export function writeActiveResultId(
  resultId: string,
): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(
    ACTIVE_RESULT_STORAGE_KEY,
    resultId,
  );
}

export function writeActiveQuestionId(
  questionId: string,
): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(
    ACTIVE_QUESTION_STORAGE_KEY,
    questionId,
  );
}

export function clearActiveQuestionId(): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(
    ACTIVE_QUESTION_STORAGE_KEY,
  );
}

export function clearActiveResultId(): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(
    ACTIVE_RESULT_STORAGE_KEY,
  );
}

export function readSentenceCollectionStore():
  SentenceCollectionStore {
  const parsed = readStorageJson(
    SENTENCE_COLLECTION_STORAGE_KEY,
  );

  if (!isObjectRecord(parsed)) {
    return {};
  }

  const store: SentenceCollectionStore = {};

  Object.entries(parsed).forEach(
    ([resultId, value]) => {
      if (!Array.isArray(value)) {
        return;
      }

      store[resultId] = value.filter(
        isSavedSentence,
      );
    },
  );

  return store;
}

export function readSavedSentences(
  resultId: string,
): SavedSentence[] {
  return (
    readSentenceCollectionStore()[resultId] ?? []
  );
}

export function writeSavedSentences(
  resultId: string,
  sentences: SavedSentence[],
): void {
  const store = readSentenceCollectionStore();

  if (sentences.length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = sentences.filter(
      isSavedSentence,
    );
  }

  writeStorageJson(
    SENTENCE_COLLECTION_STORAGE_KEY,
    store,
  );
}

export function removeSavedSentence(
  resultId: string,
  sentenceId: string,
): SavedSentence[] {
  const nextSentences = readSavedSentences(
    resultId,
  ).filter(
    (sentence) => sentence.id !== sentenceId,
  );

  writeSavedSentences(resultId, nextSentences);
  return nextSentences;
}

export function deleteSavedSentences(
  resultId: string,
): void {
  const store = readSentenceCollectionStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  writeStorageJson(
    SENTENCE_COLLECTION_STORAGE_KEY,
    store,
  );
}

export function readWordCollectionStore():
  WordCollectionStore {
  const parsed = readStorageJson(
    WORD_COLLECTION_STORAGE_KEY,
  );

  if (!isObjectRecord(parsed)) {
    return {};
  }

  const store: WordCollectionStore = {};

  Object.entries(parsed).forEach(
    ([resultId, value]) => {
      if (!Array.isArray(value)) {
        return;
      }

      store[resultId] = value.filter(isSavedWord);
    },
  );

  return store;
}

export function readSavedWords(
  resultId: string,
): SavedWord[] {
  return readWordCollectionStore()[resultId] ?? [];
}

export function writeSavedWords(
  resultId: string,
  words: SavedWord[],
): void {
  const store = readWordCollectionStore();

  if (words.length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = words.filter(isSavedWord);
  }

  writeStorageJson(
    WORD_COLLECTION_STORAGE_KEY,
    store,
  );
}

export function deleteSavedWords(
  resultId: string,
): void {
  const store = readWordCollectionStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  writeStorageJson(
    WORD_COLLECTION_STORAGE_KEY,
    store,
  );
}

function createMistakeStorageKey(
  readingId: string,
  questionId: string,
): string {
  return `${readingId}::${questionId}`;
}

export function readDismissedMistakeKeys():
  Set<string> {
  const parsed = readStorageJson(
    DISMISSED_MISTAKES_STORAGE_KEY,
  );

  if (!Array.isArray(parsed)) {
    return new Set();
  }

  return new Set(
    parsed.filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0,
    ),
  );
}

function writeDismissedMistakeKeys(
  keys: Set<string>,
): void {
  writeStorageJson(
    DISMISSED_MISTAKES_STORAGE_KEY,
    Array.from(keys),
  );
}

export function dismissMistake(
  readingId: string,
  questionId: string,
): void {
  const keys = readDismissedMistakeKeys();

  keys.add(
    createMistakeStorageKey(
      readingId,
      questionId,
    ),
  );

  writeDismissedMistakeKeys(keys);
}

export function clearDismissedMistakesForReading(
  readingId: string,
): void {
  const keys = readDismissedMistakeKeys();
  const prefix = `${readingId}::`;

  const nextKeys = new Set(
    Array.from(keys).filter(
      (key) => !key.startsWith(prefix),
    ),
  );

  writeDismissedMistakeKeys(nextKeys);
}

export function readReasoningReviewStore():
  ReasoningReviewStore {
  const parsed = readStorageJson(
    REASONING_REVIEW_STORAGE_KEY,
  );

  if (!isObjectRecord(parsed)) {
    return {};
  }

  const store: ReasoningReviewStore = {};

  Object.entries(parsed).forEach(
    ([resultId, value]) => {
      if (!isObjectRecord(value)) {
        return;
      }

      const reviews: Record<
        string,
        SavedReasoningReview
      > = {};

      Object.entries(value).forEach(
        ([questionId, review]) => {
          if (isSavedReasoningReview(review)) {
            reviews[questionId] = review;
          }
        },
      );

      store[resultId] = reviews;
    },
  );

  return store;
}

export function readSavedReasoningReviews(
  resultId: string,
): Record<string, SavedReasoningReview> {
  return (
    readReasoningReviewStore()[resultId] ?? {}
  );
}

export function writeSavedReasoningReviews(
  resultId: string,
  reviews: Record<string, SavedReasoningReview>,
): void {
  const store = readReasoningReviewStore();

  const validReviews = Object.fromEntries(
    Object.entries(reviews).filter(
      ([, review]) =>
        isSavedReasoningReview(review),
    ),
  );

  if (Object.keys(validReviews).length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = validReviews;
  }

  writeStorageJson(
    REASONING_REVIEW_STORAGE_KEY,
    store,
  );
}

export function removeSavedReasoningReview(
  resultId: string,
  questionId: string,
): Record<string, SavedReasoningReview> {
  const reviews =
    readSavedReasoningReviews(resultId);

  if (!(questionId in reviews)) {
    return reviews;
  }

  const nextReviews = {
    ...reviews,
  };

  delete nextReviews[questionId];

  writeSavedReasoningReviews(
    resultId,
    nextReviews,
  );

  return nextReviews;
}

export function deleteSavedReasoningReviews(
  resultId: string,
): void {
  const store = readReasoningReviewStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  writeStorageJson(
    REASONING_REVIEW_STORAGE_KEY,
    store,
  );
}

export function getSentenceReviewItems():
  SentenceReviewItem[] {
  const history = readSavedHistory();
  const historyById = new Map(
    history.map((record) => [
      record.id,
      record,
    ]),
  );

  const store = readSentenceCollectionStore();
  const items: SentenceReviewItem[] = [];

  Object.entries(store).forEach(
    ([readingId, sentences]) => {
      const readingTitle =
        historyById.get(readingId)?.title ??
        "已删除的阅读材料";

      sentences.forEach((sentence) => {
        items.push({
          readingId,
          readingTitle,
          sentence,
        });
      });
    },
  );

  return items.sort(
    (left, right) =>
      safeTimestamp(right.sentence.createdAt) -
      safeTimestamp(left.sentence.createdAt),
  );
}

export function getAggregatedWordReviewItems():
  AggregatedWordReviewItem[] {
  const history = readSavedHistory();
  const historyById = new Map(
    history.map((record) => [
      record.id,
      record,
    ]),
  );

  const store = readWordCollectionStore();
  const statusStore =
    readWordReviewStatusStore();

  const aggregated = new Map<
    string,
    AggregatedWordReviewItem
  >();

  Object.entries(store).forEach(
    ([readingId, words]) => {
      const readingTitle =
        historyById.get(readingId)?.title ??
        "已删除的阅读材料";

      words.forEach((word) => {
        const lemmaKey = normalizeLemma(word.lemma);
        const existing = aggregated.get(lemmaKey);

        if (!existing) {
          const statusRecord =
            statusStore[lemmaKey];

          aggregated.set(lemmaKey, {
            lemma: word.lemma,
            phonetic: word.phonetic,
            commonDefinitions:
              word.commonDefinitions,
            sources: [
              {
                readingId,
                readingTitle,
                originalWord: word.word,
                contexts: word.contexts,
              },
            ],
            firstSavedAt: word.createdAt,
            lastUpdatedAt: word.updatedAt,
            reviewStatus:
              statusRecord?.status ?? "reviewing",
            statusUpdatedAt:
              statusRecord?.updatedAt ??
              word.updatedAt,
          });

          return;
        }

        existing.sources.push({
          readingId,
          readingTitle,
          originalWord: word.word,
          contexts: word.contexts,
        });

        if (
          !existing.phonetic &&
          word.phonetic
        ) {
          existing.phonetic = word.phonetic;
        }

        if (
          existing.commonDefinitions.length === 0 &&
          word.commonDefinitions.length > 0
        ) {
          existing.commonDefinitions =
            word.commonDefinitions;
        }

        if (
          safeTimestamp(word.createdAt) <
          safeTimestamp(existing.firstSavedAt)
        ) {
          existing.firstSavedAt = word.createdAt;
        }

        if (
          safeTimestamp(word.updatedAt) >
          safeTimestamp(existing.lastUpdatedAt)
        ) {
          existing.lastUpdatedAt =
            word.updatedAt;
        }
      });
    },
  );

  return Array.from(aggregated.values()).sort(
    (left, right) =>
      safeTimestamp(right.lastUpdatedAt) -
      safeTimestamp(left.lastUpdatedAt),
  );
}

export function getReasoningReviewItems():
  ReasoningReviewItem[] {
  const history = readSavedHistory();
  const reviewStore =
    readReasoningReviewStore();

  const dismissedKeys =
    readDismissedMistakeKeys();

  const items: ReasoningReviewItem[] = [];

  history.forEach((record) => {
    const reviews =
      reviewStore[record.id] ?? {};

    record.result.questions.forEach(
      (question) => {
        const isWrong =
          question.userAnswer !== null &&
          (
            question.isCorrect === false ||
            (
              question.isCorrect === null &&
              question.userAnswer !==
                question.correctAnswer
            )
          );

        const isReliableEnough =
          question.answerSource ===
            "user_provided" ||
          question.answerConfidence === null ||
          question.answerConfidence >= 0.8;

        if (
          !isWrong ||
          !isReliableEnough
        ) {
          return;
        }

        const mistakeKey =
          createMistakeStorageKey(
            record.id,
            question.id,
          );

        if (dismissedKeys.has(mistakeKey)) {
          return;
        }

        items.push({
          readingId: record.id,
          readingTitle: record.title,
          recordCreatedAt:
            record.createdAt,
          questionId: question.id,
          questionNumber:
            question.number,
          questionStem:
            question.stem,
          correctAnswer:
            question.correctAnswer,
          userAnswer:
            question.userAnswer ?? "",
          answerSource:
            question.answerSource,
          answerConfidence:
            question.answerConfidence,
          gradingStatus:
            question.gradingStatus,
          questionAnalysis:
            question.reviewAnalysis,
          evidenceQuote:
            question.evidence.quote,
          evidenceTranslation:
            question.evidence.translation,
          errorTags:
            question.errorTags,
          review:
            reviews[question.id] ?? null,
        });
      },
    );
  });

  return items.sort(
    (left, right) => {
      const leftTime = safeTimestamp(
        left.review?.updatedAt ??
          left.recordCreatedAt,
      );

      const rightTime = safeTimestamp(
        right.review?.updatedAt ??
          right.recordCreatedAt,
      );

      return rightTime - leftTime;
    },
  );
}

