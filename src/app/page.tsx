"use client";

import Link from "next/link";
import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";

import {
  recognizeEnglishImages,
  type LocalOcrProgress,
} from "@/lib/localOcr";
import {
  renderPdfToImageFiles,
} from "@/lib/pdfToImages";
import {
  transformReadingResult,
  type DifyWorkflowOutput,
} from "@/lib/transformReadingResult";
import type {
  ReadingQuestion,
  ReadingResult,
  ReadingSummary,
} from "@/types/reading";

type EvidenceRange = {
  start: number;
  end: number;
};

type NormalizedIndex = {
  normalized: string;
  startMap: number[];
  endMap: number[];
};

type ApiErrorResponse = {
  error?: string;
  details?: string;
};

type MaterialInputMode = "paste" | "upload";

type ExtractedFileType =
  | "txt"
  | "docx"
  | "pdf"
  | "image";

type OcrReason =
  | "image"
  | "pdf_no_text"
  | "pdf_low_text"
  | "pdf_partial_text";

type ExtractTextResponse = {
  text?: string;
  fileName?: string;
  fileType?: ExtractedFileType;
  mimeType?: string | null;
  sizeBytes?: number;
  characterCount?: number;
  pageCount?: number | null;
  warnings?: string[];
  error?: string;
  details?: string;
  requiresOcr?: boolean;
  ocrReason?: OcrReason | null;
};

type UploadedFileInfo = {
  fileName: string;
  fileNames: string[];
  fileType: ExtractedFileType;
  sizeBytes: number;
  characterCount: number;
  pageCount: number | null;
  requiresOcr: boolean;
  ocrReason: OcrReason | null;
  ocrCompleted: boolean;
  averageConfidence: number | null;
  elapsedMs: number | null;
};

type SentenceTranslationResponse = {
  translation?: string;
  error?: string;
  details?: string;
};

type CommonDefinition = {
  part_of_speech: string;
  meanings: string[];
};

type WordLookupResult = {
  word: string;
  lemma: string;
  phonetic: string;
  common_definitions: CommonDefinition[];
  context_part_of_speech: string;
  context_meaning: string;
  source_sentence: string;
};

type WordLookupResponse = Partial<WordLookupResult> & {
  error?: string;
  details?: string;
};

type SavedWordContext = {
  id: string;
  paragraphId: string;
  partOfSpeech: string;
  meaning: string;
  sourceSentence: string;
  createdAt: string;
};

type SavedWord = {
  id: string;
  word: string;
  lemma: string;
  phonetic: string;
  commonDefinitions: CommonDefinition[];
  contexts: SavedWordContext[];
  createdAt: string;
  updatedAt: string;
};

type ActiveWordCard = {
  result: WordLookupResult;
  paragraphId: string;
};

type CollectionTab = "sentences" | "words";

type ReasoningVerdict =
  | "correct_but_answer_mistake"
  | "partially_correct"
  | "incorrect"
  | "insufficient_information";

type ReasoningErrorTag =
  | "detail_mislocation"
  | "question_focus_reversal"
  | "scope_expansion"
  | "causal_reversal"
  | "inference_overreach"
  | "vocabulary_misread"
  | "option_interference"
  | "logic_break"
  | "unknown";

type ReasoningReviewResult = {
  reasoning_verdict: ReasoningVerdict;
  reasoning_summary: string;
  correct_part: string;
  key_error: string;
  error_tag: ReasoningErrorTag;
  correct_reasoning: string[];
  correction: string;
};

type ReasoningReviewResponse =
  Partial<ReasoningReviewResult> & {
    error?: string;
    details?: string;
  };

type SavedReasoningReview = {
  questionId: string;
  userReasoning: string;
  result: ReasoningReviewResult;
  createdAt: string;
  updatedAt: string;
};

type SavedReadingRecord = {
  id: string;
  createdAt: string;
  title: string;
  result: ReadingResult;
};

type SavedSentence = {
  id: string;
  text: string;
  translation: string;
  paragraphId: string;
  createdAt: string;
};

type SentenceSelection = {
  paragraphId: string;
  text: string;
  sentenceContext: string;
  left: number;
  top: number;
  placement: "above" | "below";
  isDuplicate: boolean;
  isSingleWord: boolean;
};

type SentenceCollectionStore = Record<string, SavedSentence[]>;
type WordCollectionStore = Record<string, SavedWord[]>;
type ReasoningReviewStore = Record<
  string,
  Record<string, SavedReasoningReview>
>;

const HISTORY_STORAGE_KEY = "readmate-reading-history-v1";
const ACTIVE_RESULT_STORAGE_KEY = "readmate-active-result-id-v1";
const ACTIVE_QUESTION_STORAGE_KEY =
  "readmate-active-question-id-v1";
const SENTENCE_COLLECTION_STORAGE_KEY =
  "readmate-sentence-collections-v1";
const WORD_COLLECTION_STORAGE_KEY =
  "readmate-word-collections-v1";
const REASONING_REVIEW_STORAGE_KEY =
  "readmate-reasoning-reviews-v1";
const MAX_HISTORY_COUNT = 10;

function getQuestionIsCorrect(
  question: ReadingQuestion,
): boolean | null {
  if (!question.userAnswer) {
    return null;
  }

  return question.userAnswer === question.correctAnswer;
}

function getQuestionAnswerSource(
  question: ReadingQuestion,
): "user_provided" | "ai_inferred" {
  return question.answerSource ?? "user_provided";
}

function getGradedQuestionCount(
  summary: ReadingSummary,
): number {
  if (typeof summary.gradedQuestions === "number") {
    return summary.gradedQuestions;
  }

  return summary.totalQuestions;
}

function formatSummaryAccuracy(
  summary: ReadingSummary,
): string {
  const gradedQuestions = getGradedQuestionCount(summary);

  if (gradedQuestions === 0 || summary.accuracy === null) {
    return "未作答";
  }

  return `${summary.accuracy}%`;
}

function formatSummaryResult(
  summary: ReadingSummary,
): string {
  const gradedQuestions = getGradedQuestionCount(summary);

  if (gradedQuestions === 0) {
    return `${summary.totalQuestions} 题已解析`;
  }

  return `${summary.correctCount} / ${gradedQuestions} 题`;
}

function getRecordTitle(result: ReadingResult): string {
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

function formatSavedDate(value: string): string {
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

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  const extension =
    file.name.split(".").pop()?.toLowerCase() ?? "";

  return (
    file.type.toLowerCase().startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp"].includes(
      extension,
    )
  );
}

function isPdfFile(file: File): boolean {
  const extension =
    file.name.split(".").pop()?.toLowerCase() ?? "";

  return (
    extension === "pdf" ||
    file.type.toLowerCase() === "application/pdf"
  );
}

function formatElapsedTime(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return "0秒";
  }

  const seconds = elapsedMs / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  return `${minutes}分${remainingSeconds}秒`;
}

function readSavedHistory(): SavedReadingRecord[] {
  try {
    const savedText = window.localStorage.getItem(
      HISTORY_STORAGE_KEY,
    );

    if (!savedText) {
      return [];
    }

    const parsed = JSON.parse(savedText) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is SavedReadingRecord => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const record = item as Partial<SavedReadingRecord>;

        return Boolean(
          record.id &&
            record.createdAt &&
            record.title &&
            record.result?.article &&
            record.result?.summary &&
            Array.isArray(record.result?.questions),
        );
      })
      .slice(0, MAX_HISTORY_COUNT);
  } catch {
    return [];
  }
}

function writeSavedHistory(
  history: SavedReadingRecord[],
): void {
  window.localStorage.setItem(
    HISTORY_STORAGE_KEY,
    JSON.stringify(history),
  );
}

function readActiveQuestionId():
  string | null {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return null;
  }

  const value = window.localStorage.getItem(
    ACTIVE_QUESTION_STORAGE_KEY,
  );

  return value?.trim() || null;
}

function clearActiveQuestionId(): void {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    ACTIVE_QUESTION_STORAGE_KEY,
  );
}

function readSentenceCollectionStore(): SentenceCollectionStore {
  try {
    const savedText = window.localStorage.getItem(
      SENTENCE_COLLECTION_STORAGE_KEY,
    );

    if (!savedText) {
      return {};
    }

    const parsed = JSON.parse(savedText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as SentenceCollectionStore;
  } catch {
    return {};
  }
}

function readSavedSentences(resultId: string): SavedSentence[] {
  const store = readSentenceCollectionStore();
  const savedSentences = store[resultId];

  if (!Array.isArray(savedSentences)) {
    return [];
  }

  return savedSentences.filter((item): item is SavedSentence => {
    return Boolean(
      item &&
        typeof item.id === "string" &&
        typeof item.text === "string" &&
        typeof item.translation === "string" &&
        typeof item.paragraphId === "string" &&
        typeof item.createdAt === "string",
    );
  });
}

function writeSavedSentences(
  resultId: string,
  sentences: SavedSentence[],
): void {
  const store = readSentenceCollectionStore();

  if (sentences.length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = sentences;
  }

  window.localStorage.setItem(
    SENTENCE_COLLECTION_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function deleteSavedSentences(resultId: string): void {
  const store = readSentenceCollectionStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  window.localStorage.setItem(
    SENTENCE_COLLECTION_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function readWordCollectionStore(): WordCollectionStore {
  try {
    const savedText = window.localStorage.getItem(
      WORD_COLLECTION_STORAGE_KEY,
    );

    if (!savedText) {
      return {};
    }

    const parsed = JSON.parse(savedText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as WordCollectionStore;
  } catch {
    return {};
  }
}

function readSavedWords(resultId: string): SavedWord[] {
  const store = readWordCollectionStore();
  const savedWords = store[resultId];

  if (!Array.isArray(savedWords)) {
    return [];
  }

  return savedWords.filter((item): item is SavedWord => {
    return Boolean(
      item &&
        typeof item.id === "string" &&
        typeof item.word === "string" &&
        typeof item.lemma === "string" &&
        typeof item.phonetic === "string" &&
        Array.isArray(item.commonDefinitions) &&
        Array.isArray(item.contexts) &&
        typeof item.createdAt === "string" &&
        typeof item.updatedAt === "string",
    );
  });
}

function writeSavedWords(
  resultId: string,
  words: SavedWord[],
): void {
  const store = readWordCollectionStore();

  if (words.length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = words;
  }

  window.localStorage.setItem(
    WORD_COLLECTION_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function deleteSavedWords(resultId: string): void {
  const store = readWordCollectionStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  window.localStorage.setItem(
    WORD_COLLECTION_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function readReasoningReviewStore(): ReasoningReviewStore {
  try {
    const savedText = window.localStorage.getItem(
      REASONING_REVIEW_STORAGE_KEY,
    );

    if (!savedText) {
      return {};
    }

    const parsed = JSON.parse(savedText) as unknown;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as ReasoningReviewStore;
  } catch {
    return {};
  }
}

function readSavedReasoningReviews(
  resultId: string,
): Record<string, SavedReasoningReview> {
  const store = readReasoningReviewStore();
  const reviews = store[resultId];

  if (
    !reviews ||
    typeof reviews !== "object" ||
    Array.isArray(reviews)
  ) {
    return {};
  }

  const validReviews: Record<string, SavedReasoningReview> = {};

  Object.entries(reviews).forEach(([questionId, review]) => {
    if (
      review &&
      typeof review === "object" &&
      typeof review.questionId === "string" &&
      typeof review.userReasoning === "string" &&
      review.result &&
      typeof review.result === "object" &&
      typeof review.createdAt === "string" &&
      typeof review.updatedAt === "string"
    ) {
      validReviews[questionId] = review;
    }
  });

  return validReviews;
}

function writeSavedReasoningReviews(
  resultId: string,
  reviews: Record<string, SavedReasoningReview>,
): void {
  const store = readReasoningReviewStore();

  if (Object.keys(reviews).length === 0) {
    delete store[resultId];
  } else {
    store[resultId] = reviews;
  }

  window.localStorage.setItem(
    REASONING_REVIEW_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function deleteSavedReasoningReviews(resultId: string): void {
  const store = readReasoningReviewStore();

  if (!(resultId in store)) {
    return;
  }

  delete store[resultId];

  window.localStorage.setItem(
    REASONING_REVIEW_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function normalizeSelectedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLemma(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isSingleEnglishWord(value: string): boolean {
  return /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(value.trim());
}

function findSentenceContext(
  paragraphText: string,
  selectionStart: number,
  selectionEnd: number,
): string {
  let sentenceStart = 0;
  let sentenceEnd = paragraphText.length;

  for (let index = Math.max(0, selectionStart - 1); index >= 0; index -= 1) {
    if (/[.!?]/.test(paragraphText[index] ?? "")) {
      sentenceStart = index + 1;
      break;
    }
  }

  for (
    let index = Math.max(selectionEnd, selectionStart);
    index < paragraphText.length;
    index += 1
  ) {
    if (/[.!?]/.test(paragraphText[index] ?? "")) {
      sentenceEnd = index + 1;
      break;
    }
  }

  const sentence = paragraphText
    .slice(sentenceStart, sentenceEnd)
    .replace(/\s+/g, " ")
    .trim();

  return sentence || paragraphText.replace(/\s+/g, " ").trim();
}

function getElementFromNode(node: Node | null): Element | null {
  if (!node) {
    return null;
  }

  return node instanceof Element ? node : node.parentElement;
}

function createLocalId(prefix: string): string {
  if (
    typeof window !== "undefined" &&
    typeof window.crypto?.randomUUID === "function"
  ) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getReasoningVerdictLabel(
  verdict: ReasoningVerdict,
): string {
  const labels: Record<ReasoningVerdict, string> = {
    correct_but_answer_mistake: "思路基本正确，最终作答失误",
    partially_correct: "部分思路正确",
    incorrect: "核心思路存在偏差",
    insufficient_information: "思路信息不足",
  };

  return labels[verdict];
}

function getReasoningErrorTagLabel(
  errorTag: ReasoningErrorTag,
): string {
  const labels: Record<ReasoningErrorTag, string> = {
    detail_mislocation: "细节定位错误",
    question_focus_reversal: "题干方向看反",
    scope_expansion: "范围扩大或缩小",
    causal_reversal: "因果关系颠倒",
    inference_overreach: "过度推断",
    vocabulary_misread: "词义理解错误",
    option_interference: "错误选项干扰",
    logic_break: "推理链条断裂",
    unknown: "暂无法确定",
  };

  return labels[errorTag];
}

function buildNormalizedIndex(text: string): NormalizedIndex {
  let normalized = "";
  const startMap: number[] = [];
  const endMap: number[] = [];
  let previousWasWhitespace = false;

  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index);

    if (codePoint === undefined) break;

    const originalCharacter = String.fromCodePoint(codePoint);
    const originalEnd = index + originalCharacter.length;

    const normalizedChunk = originalCharacter
      .normalize("NFKC")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[‐‑‒–—]/g, "-")
      .toLowerCase();

    for (const normalizedCharacter of normalizedChunk) {
      const isWhitespace = /\s/.test(normalizedCharacter);

      if (isWhitespace) {
        if (normalized.length === 0 || previousWasWhitespace) {
          previousWasWhitespace = true;
          continue;
        }

        normalized += " ";
        startMap.push(index);
        endMap.push(originalEnd);
        previousWasWhitespace = true;
        continue;
      }

      normalized += normalizedCharacter;
      startMap.push(index);
      endMap.push(originalEnd);
      previousWasWhitespace = false;
    }

    index = originalEnd;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    startMap.pop();
    endMap.pop();
  }

  return {
    normalized,
    startMap,
    endMap,
  };
}

function findEvidenceRange(
  paragraph: string,
  evidenceQuote: string,
): EvidenceRange | null {
  const paragraphIndex = buildNormalizedIndex(paragraph);
  const evidenceIndex = buildNormalizedIndex(evidenceQuote);

  if (!evidenceIndex.normalized) {
    return null;
  }

  const normalizedStart = paragraphIndex.normalized.indexOf(
    evidenceIndex.normalized,
  );

  if (normalizedStart === -1) {
    return null;
  }

  const normalizedEnd =
    normalizedStart + evidenceIndex.normalized.length - 1;

  const start = paragraphIndex.startMap[normalizedStart];
  const end = paragraphIndex.endMap[normalizedEnd];

  if (start === undefined || end === undefined) {
    return null;
  }

  return { start, end };
}

export default function Home() {
  const [rawText, setRawText] = useState("");
  const [userAnswers, setUserAnswers] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [inputMode, setInputMode] =
    useState<MaterialInputMode>("paste");
  const [isExtractingFile, setIsExtractingFile] =
    useState(false);
  const [isRunningLocalOcr, setIsRunningLocalOcr] =
    useState(false);
  const [localOcrProgress, setLocalOcrProgress] =
    useState<LocalOcrProgress | null>(null);
  const [isDraggingFile, setIsDraggingFile] =
    useState(false);
  const [uploadedFileInfo, setUploadedFileInfo] =
    useState<UploadedFileInfo | null>(null);
  const [extractionWarnings, setExtractionWarnings] =
    useState<string[]>([]);

  const [readingResult, setReadingResult] =
    useState<ReadingResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedHistory, setSavedHistory] = useState<
    SavedReadingRecord[]
  >([]);
  const [hasLoadedLocalData, setHasLoadedLocalData] =
    useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isFileBusy =
    isExtractingFile || isRunningLocalOcr;

  useEffect(() => {
    const history = readSavedHistory();
    const activeResultId = window.localStorage.getItem(
      ACTIVE_RESULT_STORAGE_KEY,
    );

    setSavedHistory(history);

    if (activeResultId) {
      const activeRecord = history.find(
        (record) => record.id === activeResultId,
      );

      if (activeRecord) {
        setReadingResult(activeRecord.result);
      } else {
        window.localStorage.removeItem(
          ACTIVE_RESULT_STORAGE_KEY,
        );
      }
    }

    setHasLoadedLocalData(true);
  }, []);

  const handleInputModeChange = (
    nextMode: MaterialInputMode,
  ) => {
    if (isLoading || isFileBusy) {
      return;
    }

    setInputMode(nextMode);
    setErrorMessage("");
  };

  const handleLocalImageOcr = async (
    files: File[],
  ) => {
    if (isLoading || isFileBusy) {
      return;
    }

    const totalSizeBytes = files.reduce(
      (sum, file) => sum + file.size,
      0,
    );

    setInputMode("upload");
    setIsRunningLocalOcr(true);
    setLocalOcrProgress({
      phase: "validating",
      progress: 0,
      currentFile: 0,
      totalFiles: files.length,
      fileName: "",
      message: "正在检查图片……",
    });
    setErrorMessage("");
    setExtractionWarnings([]);
    setRawText("");
    setUploadedFileInfo({
      fileName:
        files.length === 1
          ? files[0].name
          : `${files.length} 张图片`,
      fileNames: files.map((file) => file.name),
      fileType: "image",
      sizeBytes: totalSizeBytes,
      characterCount: 0,
      pageCount: files.length,
      requiresOcr: true,
      ocrReason: "image",
      ocrCompleted: false,
      averageConfidence: null,
      elapsedMs: null,
    });

    try {
      const result = await recognizeEnglishImages(
        files,
        {
          maxWorkers: 2,
          preprocess: true,
          onProgress: setLocalOcrProgress,
        },
      );

      const warnings: string[] = [];
      const emptyPages = result.pages.filter(
        (page) => !page.text.trim(),
      );
      const lowConfidencePages = result.pages.filter(
        (page) =>
          typeof page.confidence === "number" &&
          page.confidence < 70,
      );

      if (files.length > 1) {
        warnings.push(
          "多张图片目前按照选择或拖入顺序合并。请在提交AI解析前检查页面顺序。",
        );
      }

      if (emptyPages.length > 0) {
        warnings.push(
          `${emptyPages.length} 张图片没有识别到文字，请检查图片清晰度和方向。`,
        );
      }

      if (lowConfidencePages.length > 0) {
        warnings.push(
          `${lowConfidencePages.length} 张图片的OCR置信度低于70%，建议重点校对。`,
        );
      }

      setRawText(result.combinedText);
      setUploadedFileInfo({
        fileName:
          files.length === 1
            ? files[0].name
            : `${files.length} 张图片`,
        fileNames: files.map((file) => file.name),
        fileType: "image",
        sizeBytes: totalSizeBytes,
        characterCount: result.totalCharacterCount,
        pageCount: files.length,
        requiresOcr: false,
        ocrReason: null,
        ocrCompleted: true,
        averageConfidence: result.averageConfidence,
        elapsedMs: result.elapsedMs,
      });
      setExtractionWarnings(warnings);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "本地OCR识别失败，请稍后重试。";

      setUploadedFileInfo(null);
      setRawText("");
      setErrorMessage(message);
    } finally {
      setIsRunningLocalOcr(false);
      setLocalOcrProgress(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleLocalPdfOcr = async (
    file: File,
    detectedPageCount: number | null,
    initialWarnings: string[] = [],
  ) => {
    const startedAt = performance.now();

    setIsRunningLocalOcr(true);
    setErrorMessage("");
    setRawText("");
    setExtractionWarnings(initialWarnings);
    setUploadedFileInfo({
      fileName: file.name,
      fileNames: [file.name],
      fileType: "pdf",
      sizeBytes: file.size,
      characterCount: 0,
      pageCount: detectedPageCount,
      requiresOcr: true,
      ocrReason: "pdf_no_text",
      ocrCompleted: false,
      averageConfidence: null,
      elapsedMs: null,
    });

    try {
      const rendered =
        await renderPdfToImageFiles(file, {
          maxPages: 10,
          targetLongEdge: 2200,
          onProgress: (progress) => {
            setLocalOcrProgress({
              phase: "preprocessing",
              progress:
                progress.progress * 0.2,
              currentFile:
                progress.currentPage,
              totalFiles:
                progress.totalPages,
              fileName: file.name,
              message: progress.message,
            });
          },
        });

      const result =
        await recognizeEnglishImages(
          rendered.files,
          {
            maxWorkers: 2,
            preprocess: true,
            onProgress: (progress) => {
              setLocalOcrProgress({
                ...progress,
                progress:
                  0.2 +
                  progress.progress * 0.8,
              });
            },
          },
        );

      const warnings = [
        ...initialWarnings,
      ];

      const emptyPages = result.pages.filter(
        (page) => !page.text.trim(),
      );

      const lowConfidencePages =
        result.pages.filter(
          (page) =>
            typeof page.confidence === "number" &&
            page.confidence < 70,
        );

      if (emptyPages.length > 0) {
        warnings.push(
          `${emptyPages.length} 页没有识别到文字，请检查PDF页面清晰度。`,
        );
      }

      if (lowConfidencePages.length > 0) {
        warnings.push(
          `${lowConfidencePages.length} 页的OCR置信度低于70%，建议重点校对。`,
        );
      }

      warnings.push(
        "扫描版PDF已按原页码顺序识别。提交AI解析前，请检查段落、题号和A/B/C/D选项。",
      );

      setRawText(result.combinedText);
      setUploadedFileInfo({
        fileName: file.name,
        fileNames: [file.name],
        fileType: "pdf",
        sizeBytes: file.size,
        characterCount:
          result.totalCharacterCount,
        pageCount: rendered.pageCount,
        requiresOcr: false,
        ocrReason: null,
        ocrCompleted: true,
        averageConfidence:
          result.averageConfidence,
        elapsedMs: Math.round(
          performance.now() - startedAt,
        ),
      });
      setExtractionWarnings(warnings);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "扫描版PDF本地OCR失败。";

      setUploadedFileInfo(null);
      setRawText("");
      setErrorMessage(message);
    } finally {
      setIsRunningLocalOcr(false);
      setLocalOcrProgress(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleExtractDocument = async (
    file: File,
  ) => {
    if (isLoading || isFileBusy) {
      return;
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase() ?? "";

    if (!["txt", "docx", "pdf"].includes(extension)) {
      setErrorMessage(
        "文档文件暂时只支持 TXT、DOCX 和 PDF。",
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(
        "文件超过 10 MB，请压缩文件后重新上传。",
      );
      return;
    }

    setInputMode("upload");
    setIsExtractingFile(true);
    setErrorMessage("");
    setExtractionWarnings([]);
    setLocalOcrProgress(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-text", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let responseData: ExtractTextResponse;

      try {
        responseData = JSON.parse(
          responseText,
        ) as ExtractTextResponse;
      } catch {
        throw new Error(
          "文件提取接口返回了无法解析的内容，请检查 extract-text/route.ts。",
        );
      }

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            responseData.details ||
            "文件检查失败。",
        );
      }

      if (
        !responseData.fileName ||
        !responseData.fileType ||
        typeof responseData.sizeBytes !== "number" ||
        typeof responseData.characterCount !== "number"
      ) {
        throw new Error(
          "文件提取接口返回的数据不完整。",
        );
      }

      if (
        !responseData.text?.trim() &&
        !responseData.requiresOcr
      ) {
        throw new Error(
          "没有从文件中提取到可用文字。",
        );
      }

      const warnings = Array.isArray(
        responseData.warnings,
      )
        ? [...responseData.warnings]
        : [];

      if (
        responseData.fileType === "pdf" &&
        responseData.requiresOcr
      ) {
        warnings.push(
          "检测到扫描版或图片型PDF，正在自动转为图片并进行本地OCR。",
        );

        setIsExtractingFile(false);

        await handleLocalPdfOcr(
          file,
          typeof responseData.pageCount ===
            "number"
            ? responseData.pageCount
            : null,
          warnings,
        );

        return;
      }

      setRawText(responseData.text ?? "");
      setUploadedFileInfo({
        fileName: responseData.fileName,
        fileNames: [responseData.fileName],
        fileType: responseData.fileType,
        sizeBytes: responseData.sizeBytes,
        characterCount: responseData.characterCount,
        pageCount:
          typeof responseData.pageCount === "number"
            ? responseData.pageCount
            : null,
        requiresOcr: false,
        ocrReason: null,
        ocrCompleted: false,
        averageConfidence: null,
        elapsedMs: null,
      });
      setExtractionWarnings(warnings);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "文件文字提取失败，请稍后重试。";

      setUploadedFileInfo(null);
      setErrorMessage(message);
    } finally {
      setIsExtractingFile(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectedFiles = async (
    files: File[],
  ) => {
    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter(isImageFile);

    if (imageFiles.length === files.length) {
      await handleLocalImageOcr(files);
      return;
    }

    if (files.length > 1) {
      setErrorMessage(
        "一次选择多个文件时只能上传图片。TXT、DOCX和PDF请一次上传一个。",
      );
      return;
    }

    await handleExtractDocument(files[0]);
  };

  const handleFileInputChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(
      event.target.files ?? [],
    );

    if (files.length > 0) {
      void handleSelectedFiles(files);
    }
  };

  const handleFileDragOver = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    if (!isLoading && !isFileBusy) {
      setIsDraggingFile(true);
    }
  };

  const handleFileDragLeave = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setIsDraggingFile(false);
  };

  const handleFileDrop = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setIsDraggingFile(false);

    const files = Array.from(
      event.dataTransfer.files ?? [],
    );

    if (files.length > 0) {
      void handleSelectedFiles(files);
    }
  };

  const handleRemoveUploadedFile = () => {
    if (isLoading || isFileBusy) {
      return;
    }

    setUploadedFileInfo(null);
    setExtractionWarnings([]);
    setLocalOcrProgress(null);
    setRawText("");
    setErrorMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isFileBusy) {
      return;
    }

    setErrorMessage("");

    if (!rawText.trim()) {
      setErrorMessage(
        inputMode === "upload"
          ? "请先上传文件并完成文字提取。"
          : "请先粘贴英语文章、题目和选项。",
      );
      return;
    }

    const normalizedUserAnswers = userAnswers
      .trim()
      .toUpperCase();

    const normalizedAnswerKey = answerKey
      .trim()
      .toUpperCase();

    if (
      normalizedUserAnswers &&
      normalizedAnswerKey &&
      normalizedUserAnswers.length !==
        normalizedAnswerKey.length
    ) {
      setErrorMessage(
        "你的答案数量与正确答案数量不一致。",
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawText,
          userAnswers: normalizedUserAnswers,
          answerKey: normalizedAnswerKey,
        }),
      });

      const responseData = (await response.json()) as
        | DifyWorkflowOutput
        | ApiErrorResponse;

      if (!response.ok) {
        const errorData = responseData as ApiErrorResponse;

        throw new Error(
          errorData.error ||
            errorData.details ||
            "解析请求失败，请稍后重试。",
        );
      }

      const transformedResult = transformReadingResult(
        responseData as DifyWorkflowOutput,
        `reading-result-${Date.now()}`,
      );

      const savedRecord: SavedReadingRecord = {
        id: transformedResult.id,
        createdAt: new Date().toISOString(),
        title: getRecordTitle(transformedResult),
        result: transformedResult,
      };

      setSavedHistory((currentHistory) => {
        const nextHistory = [
          savedRecord,
          ...currentHistory.filter(
            (record) => record.id !== savedRecord.id,
          ),
        ].slice(0, MAX_HISTORY_COUNT);

        try {
          writeSavedHistory(nextHistory);
          window.localStorage.setItem(
            ACTIVE_RESULT_STORAGE_KEY,
            savedRecord.id,
          );
        } catch {
          setErrorMessage(
            "解析已经完成，但浏览器本地存储空间不足，本次结果可能无法长期保存。",
          );
        }

        return nextHistory;
      });

      setReadingResult(transformedResult);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "解析过程中发生未知错误。";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLibrary = () => {
    window.localStorage.removeItem(
      ACTIVE_RESULT_STORAGE_KEY,
    );
    setReadingResult(null);
    setErrorMessage("");
  };

  const handleOpenRecord = (record: SavedReadingRecord) => {
    window.localStorage.setItem(
      ACTIVE_RESULT_STORAGE_KEY,
      record.id,
    );
    setReadingResult(record.result);
    setErrorMessage("");
  };

  const handleDeleteRecord = (recordId: string) => {
    setSavedHistory((currentHistory) => {
      const nextHistory = currentHistory.filter(
        (record) => record.id !== recordId,
      );

      try {
        writeSavedHistory(nextHistory);
        deleteSavedSentences(recordId);
        deleteSavedWords(recordId);
        deleteSavedReasoningReviews(recordId);
      } catch {
        setErrorMessage("删除记录失败，请稍后重试。");
      }

      return nextHistory;
    });
  };

  if (!hasLoadedLocalData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="font-medium text-slate-600">
            正在读取本地记录...
          </span>
        </div>
      </main>
    );
  }

  if (readingResult) {
    return (
      <ReadingResultView
        key={readingResult.id}
        readingResult={readingResult}
        onReset={handleBackToLibrary}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              ReadMate AI
            </p>
            <h1 className="text-xl font-bold">英语阅读复盘</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/review"
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              复习中心
            </Link>

            <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 sm:inline-flex">
              AI 阅读解析
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold text-indigo-600">
            新建阅读解析
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            导入阅读材料，生成完整复盘
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-slate-500">
            可以直接粘贴文本，也可以上传 TXT、DOCX、PDF
            或多张英语试卷图片。图片会在浏览器本地完成英文OCR。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-800">
              导入方式
            </p>

            <div className="mt-3 grid max-w-md grid-cols-2 rounded-2xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => handleInputModeChange("paste")}
                disabled={isLoading || isFileBusy}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  inputMode === "paste"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                粘贴文本
              </button>

              <button
                type="button"
                onClick={() => handleInputModeChange("upload")}
                disabled={isLoading || isFileBusy}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  inputMode === "upload"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                上传文件
              </button>
            </div>
          </div>

          {inputMode === "paste" ? (
            <div>
              <label
                htmlFor="rawText"
                className="text-sm font-semibold text-slate-800"
              >
                阅读材料、题目和选项
              </label>

              <p className="mt-1 text-sm text-slate-400">
                请把英语文章、题目及 A/B/C/D
                选项完整粘贴到同一个文本框中。
              </p>

              <textarea
                id="rawText"
                value={rawText}
                onChange={(event) => {
                  setRawText(event.target.value);
                  setErrorMessage("");
                }}
                disabled={isLoading || isFileBusy}
                placeholder={`请粘贴完整内容，例如：

Food health scares and dietary controversies...

1. Who concluded that...?
A. ...
B. ...
C. ...
D. ...`}
                className="mt-3 min-h-[360px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-[15px] leading-7 outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.docx,.pdf,.jpg,.jpeg,.png,.webp,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div
                onDragOver={handleFileDragOver}
                onDragLeave={handleFileDragLeave}
                onDrop={handleFileDrop}
                className={`rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                  isDraggingFile
                    ? "border-indigo-500 bg-indigo-50"
                    : isRunningLocalOcr
                      ? "border-indigo-300 bg-indigo-50/60"
                      : uploadedFileInfo?.requiresOcr
                      ? "border-amber-300 bg-amber-50/50"
                      : uploadedFileInfo
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40"
                }`}
              >
                {isRunningLocalOcr ? (
                  <div className="mx-auto max-w-xl">
                    <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
                    <p className="mt-4 font-semibold text-slate-700">
                      {localOcrProgress?.message ??
                        "正在进行本地OCR识别……"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      扫描版PDF会先在浏览器中逐页转成图片，再使用本地英文OCR；第一次运行会下载识别模型。
                    </p>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            (localOcrProgress?.progress ?? 0) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-indigo-600">
                      {Math.round(
                        (localOcrProgress?.progress ?? 0) * 100,
                      )}%
                    </p>
                  </div>
                ) : isExtractingFile ? (
                  <div className="flex flex-col items-center">
                    <span className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
                    <p className="mt-4 font-semibold text-slate-700">
                      正在检查并提取文件文字
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      普通PDF会直接提取文字；扫描版PDF会自动转图片并进行本地OCR。
                    </p>
                  </div>
                ) : uploadedFileInfo ? (
                  <div>
                    <div
                      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
                        uploadedFileInfo.requiresOcr
                          ? "bg-amber-100 text-amber-700"
                          : uploadedFileInfo.ocrCompleted
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-7 w-7"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 3.75h7.25L18.5 8v12.25H7V3.75Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14 3.75V8h4.5M9.5 13l1.6 1.6 3.4-3.4"
                        />
                      </svg>
                    </div>

                    <p className="mt-4 break-all font-semibold text-slate-800">
                      {uploadedFileInfo.fileName}
                    </p>

                    <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                        {uploadedFileInfo.fileType.toUpperCase()}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                        {formatFileSize(
                          uploadedFileInfo.sizeBytes,
                        )}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                        {uploadedFileInfo.characterCount.toLocaleString(
                          "zh-CN",
                        )}{" "}
                        字符
                      </span>
                      {uploadedFileInfo.pageCount !== null && (
                        <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                          {uploadedFileInfo.fileType === "image"
                            ? `${uploadedFileInfo.pageCount} 张图片`
                            : `${uploadedFileInfo.pageCount} 页`}
                        </span>
                      )}

                      {uploadedFileInfo.ocrCompleted && (
                        <span className="rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">
                          本地 OCR 完成
                        </span>
                      )}

                      {uploadedFileInfo.averageConfidence !== null && (
                        <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                          平均置信度 {uploadedFileInfo.averageConfidence.toFixed(1)}%
                        </span>
                      )}

                      {uploadedFileInfo.elapsedMs !== null && (
                        <span className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">
                          用时 {formatElapsedTime(uploadedFileInfo.elapsedMs)}
                        </span>
                      )}

                      {uploadedFileInfo.requiresOcr && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                          需要 OCR
                        </span>
                      )}
                    </div>

                    {uploadedFileInfo.requiresOcr && (
                      <div className="mx-auto mt-4 max-w-xl rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-left">
                        <p className="text-sm font-semibold text-amber-800">
                          这个PDF正在等待OCR
                        </p>
                        <p className="mt-1 text-sm leading-6 text-amber-700">
                          系统会自动把PDF页面转换成图片并进行本地英文OCR，不需要手动导出。
                        </p>
                      </div>
                    )}

                    {uploadedFileInfo.ocrCompleted && (
                      <div className="mx-auto mt-4 max-w-xl rounded-xl border border-indigo-200 bg-white/80 px-4 py-3 text-left">
                        <p className="text-sm font-semibold text-indigo-800">
                          本地OCR识别完成
                        </p>
                        <p className="mt-1 text-sm leading-6 text-indigo-700">
                          识别文字已经填入下方文本框。请重点检查专有名词、题号、选项和跨图片顺序。
                        </p>
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          fileInputRef.current?.click()
                        }
                        className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        更换文件
                      </button>

                      <button
                        type="button"
                        onClick={handleRemoveUploadedFile}
                        className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white hover:text-rose-600"
                      >
                        移除文件
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-7 w-7"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 14.5v4.75h14V14.5"
                        />
                      </svg>
                    </div>

                    <p className="mt-4 font-semibold text-slate-700">
                      将文件拖到这里
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      支持 TXT、DOCX、PDF，以及多张 JPG、PNG、WEBP；单个文件不超过 10 MB
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      选择文件或图片
                    </button>

                    <p className="mt-3 text-xs text-slate-400">
                      图片会在浏览器本地OCR；扫描版PDF请先导出为图片
                    </p>
                  </div>
                )}
              </div>

              {extractionWarnings.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">
                    请检查提取结果
                  </p>
                  <div className="mt-2 space-y-1">
                    {extractionWarnings.map(
                      (warning, warningIndex) => (
                        <p
                          key={`extraction-warning-${warningIndex}`}
                          className="text-sm leading-6 text-amber-700"
                        >
                          · {warning}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              )}

              {(uploadedFileInfo || rawText) && (
                <div className="mt-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <label
                        htmlFor="extractedRawText"
                        className="text-sm font-semibold text-slate-800"
                      >
                        {uploadedFileInfo?.ocrCompleted
                          ? "OCR 文本预览"
                          : "提取文本预览"}
                      </label>
                      <p className="mt-1 text-sm text-slate-400">
                        {uploadedFileInfo?.ocrCompleted
                          ? "请检查段落、题号和A/B/C/D选项，可直接修改。"
                          : uploadedFileInfo?.requiresOcr
                            ? "正在准备扫描版PDF的本地OCR。"
                            : "解析前请检查文章、题目和选项是否完整，可直接修改。"}
                      </p>
                    </div>

                    <span className="text-xs text-slate-400">
                      {rawText.length.toLocaleString("zh-CN")} 字符
                    </span>
                  </div>

                  <textarea
                    id="extractedRawText"
                    value={rawText}
                    onChange={(event) => {
                      setRawText(event.target.value);
                      setErrorMessage("");
                    }}
                    disabled={isLoading || isFileBusy}
                    placeholder={
                      isRunningLocalOcr
                        ? "正在进行本地OCR识别……"
                        : uploadedFileInfo?.requiresOcr
                          ? "正在将扫描版PDF转换成图片并识别……"
                          : "文件提取或OCR识别的文字会显示在这里。"
                    }
                    className="mt-3 min-h-[320px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-[15px] leading-7 outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="userAnswers"
                className="text-sm font-semibold text-slate-800"
              >
                你的答案（选填）
              </label>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                填写后可获得答题判断和错因分析。
              </p>

              <input
                id="userAnswers"
                value={userAnswers}
                onChange={(event) =>
                  setUserAnswers(
                    event.target.value
                      .replace(/[^a-dA-D]/g, "")
                      .toUpperCase(),
                  )
                }
                disabled={isLoading || isFileBusy}
                placeholder="例如：BACD"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold uppercase tracking-[0.35em] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div>
              <label
                htmlFor="answerKey"
                className="text-sm font-semibold text-slate-800"
              >
                正确答案（选填）
              </label>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                未填写时，AI 会根据文章证据推断参考答案。
              </p>

              <input
                id="answerKey"
                value={answerKey}
                onChange={(event) =>
                  setAnswerKey(
                    event.target.value
                      .replace(/[^a-dA-D]/g, "")
                      .toUpperCase(),
                  )
                }
                disabled={isLoading || isFileBusy}
                placeholder="例如：BAAD；可留空由 AI 推断"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold uppercase tracking-[0.35em] outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>
          </div>


          <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm leading-6 text-slate-600">
            {answerKey.trim()
              ? userAnswers.trim()
                ? "完整模式：使用你提供的正确答案进行判分和错因分析。"
                : "答案解析模式：使用你提供的正确答案，但不进行个人判分。"
              : userAnswers.trim()
                ? "AI 判题模式：AI 将推断参考答案，并与你的答案比较。"
                : "纯解析模式：AI 将推断参考答案，但不进行个人判分。"}
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              {isRunningLocalOcr
                ? localOcrProgress?.message ?? "正在进行本地OCR识别。"
                : isExtractingFile
                  ? "正在提取文件，请稍候。"
                  : "解析通常需要几十秒，请不要重复点击。"}
            </p>

            <button
              type="submit"
              disabled={
                isLoading ||
                isFileBusy ||
                !rawText.trim()
              }
              className="inline-flex min-w-40 items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isLoading
                ? "正在解析..."
                : isRunningLocalOcr
                  ? "正在OCR识别..."
                  : isExtractingFile
                    ? "正在提取..."
                    : "开始 AI 解析"}
            </button>
          </div>

          {isLoading && (
            <div className="mt-6 rounded-2xl bg-indigo-50 p-5">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />

                <div>
                  <p className="font-semibold text-indigo-800">
                    正在生成文章翻译和题目解析
                  </p>
                  <p className="mt-1 text-sm text-indigo-600">
                    工作流正在进行结构化、质量校验与解析，请保持页面打开。
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-600">
                本地资料库
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                最近解析记录
              </h2>
            </div>

            <span className="text-sm text-slate-400">
              最多保存 {MAX_HISTORY_COUNT} 篇
            </span>
          </div>

          {savedHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <p className="font-medium text-slate-600">
                暂无解析记录
              </p>
              <p className="mt-2 text-sm text-slate-400">
                完成第一次 AI 解析后，结果会自动保存在这里。
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {savedHistory.map((record) => (
                <article
                  key={record.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenRecord(record)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-semibold leading-6 text-slate-800">
                          {record.title}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          {formatSavedDate(record.createdAt)}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                        {formatSummaryAccuracy(
                          record.result.summary,
                        )}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">
                        {formatSummaryResult(
                          record.result.summary,
                        )}
                      </span>

                      {record.result.summary.primaryErrorTag && (
                        <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-600">
                          {
                            record.result.summary
                              .primaryErrorTag
                          }
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => handleOpenRecord(record)}
                      className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      查看复盘
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteRecord(record.id)
                      }
                      className="text-sm font-medium text-slate-400 hover:text-rose-600"
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

type ReadingResultViewProps = {
  readingResult: ReadingResult;
  onReset: () => void;
};

function ReadingResultView({
  readingResult,
  onReset,
}: ReadingResultViewProps) {
  const { article, questions, summary } = readingResult;

  const [activeQuestionId, setActiveQuestionId] = useState(() => {
    const firstWrongQuestion = questions.find(
      (question) =>
        getQuestionIsCorrect(question) === false,
    );

    return firstWrongQuestion?.id ?? questions[0]?.id ?? "";
  });

  const [isEvidenceLocated, setIsEvidenceLocated] = useState(false);
  const [savedSentences, setSavedSentences] = useState<
    SavedSentence[]
  >([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [sentenceSelection, setSentenceSelection] =
    useState<SentenceSelection | null>(null);
  const [isCollectionOpen, setIsCollectionOpen] =
    useState(false);
  const [collectionTab, setCollectionTab] =
    useState<CollectionTab>("sentences");
  const [collectionMessage, setCollectionMessage] =
    useState("");
  const [isTranslatingSentence, setIsTranslatingSentence] =
    useState(false);
  const [isLookingUpWord, setIsLookingUpWord] =
    useState(false);
  const [activeWordCard, setActiveWordCard] =
    useState<ActiveWordCard | null>(null);
  const [reasoningDrafts, setReasoningDrafts] = useState<
    Record<string, string>
  >({});
  const [reasoningReviews, setReasoningReviews] = useState<
    Record<string, SavedReasoningReview>
  >({});
  const [isReasoningOpen, setIsReasoningOpen] =
    useState(false);
  const [isReviewingReasoning, setIsReviewingReasoning] =
    useState(false);
  const [reasoningError, setReasoningError] = useState("");

  const articleScrollRef = useRef<HTMLElement | null>(null);
  const evidenceRef = useRef<HTMLElement | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(
    null,
  );
  const highlightTimerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  const activeQuestion =
    questions.find((question) => question.id === activeQuestionId) ??
    questions[0];

  const activeReasoningReview = activeQuestion
    ? reasoningReviews[activeQuestion.id]
    : undefined;

  const activeReasoningDraft = activeQuestion
    ? (reasoningDrafts[activeQuestion.id] ??
      activeReasoningReview?.userReasoning ??
      "")
    : "";

  useEffect(() => {
    const requestedQuestionId =
      readActiveQuestionId();

    if (
      requestedQuestionId &&
      questions.some(
        (question) =>
          question.id === requestedQuestionId,
      )
    ) {
      setActiveQuestionId(
        requestedQuestionId,
      );
      setIsReasoningOpen(true);
    }

    clearActiveQuestionId();
  }, [questions, readingResult.id]);

  useEffect(() => {
    setSavedSentences(readSavedSentences(readingResult.id));
    setSavedWords(readSavedWords(readingResult.id));

    const storedReviews = readSavedReasoningReviews(
      readingResult.id,
    );

    setReasoningReviews(storedReviews);
    setReasoningDrafts(
      Object.fromEntries(
        Object.entries(storedReviews).map(
          ([questionId, review]) => [
            questionId,
            review.userReasoning,
          ],
        ),
      ),
    );
  }, [readingResult.id]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        selectionToolbarRef.current &&
        target &&
        selectionToolbarRef.current.contains(target)
      ) {
        return;
      }

      const articleContainer = articleScrollRef.current;

      if (
        articleContainer &&
        target &&
        articleContainer.contains(target)
      ) {
        return;
      }

      setSentenceSelection(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSentenceSelection(null);
        setIsCollectionOpen(false);
        setActiveWordCard(null);
        setIsReasoningOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      document.removeEventListener("keydown", handleKeyDown);

      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }

      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  if (!activeQuestion) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">暂无阅读解析数据</h1>
          <button
            type="button"
            onClick={onReset}
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white"
          >
            返回重新解析
          </button>
        </div>
      </main>
    );
  }

  const isActiveQuestionCorrect =
    getQuestionIsCorrect(activeQuestion);

  const hasActiveUserAnswer =
    Boolean(activeQuestion.userAnswer);

  const activeAnswerSource =
    getQuestionAnswerSource(activeQuestion);

  const isActiveAnswerAiInferred =
    activeAnswerSource === "ai_inferred";

  const activeAnswerLabel =
    isActiveAnswerAiInferred
      ? "AI参考答案"
      : "正确答案";

  const activeAnswerConfidence =
    activeQuestion.answerConfidence ?? null;

  const canReviewReasoning =
    isActiveQuestionCorrect === false &&
    hasActiveUserAnswer &&
    (!isActiveAnswerAiInferred ||
      activeAnswerConfidence === null ||
      activeAnswerConfidence >= 0.8);

  const gradedQuestionCount =
    getGradedQuestionCount(summary);

  const mainErrorReason =
    gradedQuestionCount > 0
      ? summary.primaryErrorTag ?? "暂无明显错因"
      : summary.aiInferredCount > 0
        ? "AI参考答案"
        : "答案解析";

  const handleQuestionChange = (questionId: string) => {
    setActiveQuestionId(questionId);
    setIsEvidenceLocated(false);
    setSentenceSelection(null);
    setIsReasoningOpen(false);
    setReasoningError("");

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  };

  const showCollectionMessage = (message: string) => {
    setCollectionMessage(message);

    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
    }

    messageTimerRef.current = window.setTimeout(() => {
      setCollectionMessage("");
    }, 1800);
  };

  const handleTextSelection = () => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const articleContainer = articleScrollRef.current;

      if (
        !selection ||
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        !articleContainer
      ) {
        setSentenceSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const startElement = getElementFromNode(
        range.startContainer,
      );
      const endElement = getElementFromNode(
        range.endContainer,
      );

      const startParagraph = startElement?.closest(
        "[data-english-paragraph-id]",
      ) as HTMLElement | null;

      const endParagraph = endElement?.closest(
        "[data-english-paragraph-id]",
      ) as HTMLElement | null;

      if (
        !startParagraph ||
        !endParagraph ||
        startParagraph !== endParagraph ||
        !articleContainer.contains(startParagraph)
      ) {
        setSentenceSelection(null);
        return;
      }

      const paragraphId =
        startParagraph.dataset.englishParagraphId;

      const selectedText = normalizeSelectedText(
        selection.toString(),
      );

      if (!paragraphId || selectedText.length < 2) {
        setSentenceSelection(null);
        return;
      }

      const paragraphText =
        startParagraph.textContent ?? "";

      const prefixRange = range.cloneRange();
      prefixRange.selectNodeContents(startParagraph);
      prefixRange.setEnd(
        range.startContainer,
        range.startOffset,
      );

      const selectionStart = prefixRange.toString().length;
      const selectionEnd =
        selectionStart + selection.toString().length;

      const sentenceContext = findSentenceContext(
        paragraphText,
        selectionStart,
        selectionEnd,
      );

      const selectionRect = range.getBoundingClientRect();

      if (
        selectionRect.width === 0 &&
        selectionRect.height === 0
      ) {
        setSentenceSelection(null);
        return;
      }

      const isDuplicate = savedSentences.some(
        (item) =>
          item.paragraphId === paragraphId &&
          normalizeSelectedText(item.text) === selectedText,
      );

      const placement =
        selectionRect.top > 88 ? "above" : "below";

      const unclampedLeft =
        selectionRect.left + selectionRect.width / 2;

      const left = Math.min(
        Math.max(unclampedLeft, 92),
        window.innerWidth - 92,
      );

      const top =
        placement === "above"
          ? selectionRect.top - 10
          : selectionRect.bottom + 10;

      setSentenceSelection({
        paragraphId,
        text: selectedText,
        sentenceContext,
        left,
        top,
        placement,
        isDuplicate,
        isSingleWord: isSingleEnglishWord(selectedText),
      });
    }, 0);
  };

  const handleAddSelectedSentence = async () => {
    if (!sentenceSelection || isTranslatingSentence) {
      return;
    }

    if (sentenceSelection.isDuplicate) {
      setCollectionTab("sentences");
      setIsCollectionOpen(true);
      setSentenceSelection(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    const selectionSnapshot = sentenceSelection;

    const paragraph = article.paragraphs.find(
      (item) => item.id === selectionSnapshot.paragraphId,
    );

    if (!paragraph) {
      showCollectionMessage("未找到这句话所在的段落。");
      return;
    }

    setIsTranslatingSentence(true);

    try {
      const response = await fetch("/api/translate-sentence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedText: selectionSnapshot.text,
          paragraphContext: paragraph.original,
        }),
      });

      const responseData =
        (await response.json()) as SentenceTranslationResponse;

      if (!response.ok || !responseData.translation?.trim()) {
        throw new Error(
          responseData.error ||
            responseData.details ||
            "句子精准翻译失败，请稍后重试。",
        );
      }

      const newSentence: SavedSentence = {
        id: createLocalId("sentence"),
        text: selectionSnapshot.text,
        translation: responseData.translation.trim(),
        paragraphId: paragraph.id,
        createdAt: new Date().toISOString(),
      };

      setSavedSentences((currentSentences) => {
        const nextSentences = [
          newSentence,
          ...currentSentences,
        ];

        try {
          writeSavedSentences(
            readingResult.id,
            nextSentences,
          );
        } catch {
          showCollectionMessage(
            "翻译已经完成，但浏览器本地存储空间不足。",
          );
        }

        return nextSentences;
      });

      setSentenceSelection(null);
      window.getSelection()?.removeAllRanges();
      showCollectionMessage("精准翻译完成，句子已收藏");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "句子精准翻译失败，请稍后重试。";

      showCollectionMessage(message);
    } finally {
      setIsTranslatingSentence(false);
    }
  };

  const handleLookupSelectedWord = async () => {
    if (
      !sentenceSelection ||
      !sentenceSelection.isSingleWord ||
      isLookingUpWord
    ) {
      return;
    }

    const selectionSnapshot = sentenceSelection;

    setIsLookingUpWord(true);

    try {
      const response = await fetch("/api/lookup-word", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedWord: selectionSnapshot.text,
          sentenceContext: selectionSnapshot.sentenceContext,
        }),
      });

      const responseText = await response.text();
      let responseData: WordLookupResponse;

      try {
        responseData = JSON.parse(
          responseText,
        ) as WordLookupResponse;
      } catch {
        throw new Error(
          "单词查询接口返回了无法解析的内容，请检查 lookup-word/route.ts。",
        );
      }

      if (
        !response.ok ||
        !responseData.word ||
        !responseData.lemma ||
        !Array.isArray(responseData.common_definitions) ||
        !responseData.context_part_of_speech ||
        !responseData.context_meaning ||
        !responseData.source_sentence
      ) {
        throw new Error(
          responseData.error ||
            responseData.details ||
            "单词查询失败，请稍后重试。",
        );
      }

      setActiveWordCard({
        paragraphId: selectionSnapshot.paragraphId,
        result: {
          word: responseData.word,
          lemma: responseData.lemma,
          phonetic: responseData.phonetic ?? "",
          common_definitions:
            responseData.common_definitions,
          context_part_of_speech:
            responseData.context_part_of_speech,
          context_meaning:
            responseData.context_meaning,
          source_sentence:
            responseData.source_sentence,
        },
      });

      setSentenceSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "单词查询失败，请稍后重试。";

      showCollectionMessage(message);
    } finally {
      setIsLookingUpWord(false);
    }
  };

  const handleSaveActiveWord = () => {
    if (!activeWordCard) {
      return;
    }

    const { result, paragraphId } = activeWordCard;
    const lemmaKey = normalizeLemma(result.lemma);
    const now = new Date().toISOString();
    const existingIndex = savedWords.findIndex(
      (item) => normalizeLemma(item.lemma) === lemmaKey,
    );

    const newContext: SavedWordContext = {
      id: createLocalId("word-context"),
      paragraphId,
      partOfSpeech: result.context_part_of_speech,
      meaning: result.context_meaning,
      sourceSentence: result.source_sentence,
      createdAt: now,
    };

    let nextWords: SavedWord[];
    let message = "单词已收藏";

    if (existingIndex === -1) {
      const newWord: SavedWord = {
        id: createLocalId("word"),
        word: result.word,
        lemma: result.lemma,
        phonetic: result.phonetic,
        commonDefinitions: result.common_definitions,
        contexts: [newContext],
        createdAt: now,
        updatedAt: now,
      };

      nextWords = [newWord, ...savedWords];
    } else {
      const existingWord = savedWords[existingIndex];
      const contextExists = existingWord.contexts.some(
        (context) =>
          normalizeSelectedText(context.sourceSentence) ===
            normalizeSelectedText(result.source_sentence) &&
          normalizeSelectedText(context.meaning) ===
            normalizeSelectedText(result.context_meaning),
      );

      if (contextExists) {
        setActiveWordCard(null);
        showCollectionMessage(
          "这个单词及当前语境已经收藏",
        );
        return;
      }

      const updatedWord: SavedWord = {
        ...existingWord,
        phonetic: existingWord.phonetic || result.phonetic,
        commonDefinitions:
          existingWord.commonDefinitions.length > 0
            ? existingWord.commonDefinitions
            : result.common_definitions,
        contexts: [newContext, ...existingWord.contexts],
        updatedAt: now,
      };

      nextWords = [...savedWords];
      nextWords[existingIndex] = updatedWord;
      message = "已为该单词补充当前语境";
    }

    try {
      writeSavedWords(readingResult.id, nextWords);
      setSavedWords(nextWords);
      setActiveWordCard(null);
      showCollectionMessage(message);
    } catch {
      showCollectionMessage(
        "单词解析已经完成，但浏览器本地存储空间不足。",
      );
    }
  };

  const handleDeleteWord = (wordId: string) => {
    setSavedWords((currentWords) => {
      const nextWords = currentWords.filter(
        (item) => item.id !== wordId,
      );

      try {
        writeSavedWords(readingResult.id, nextWords);
        showCollectionMessage("已从本篇单词本移除");
      } catch {
        showCollectionMessage("删除单词失败，请稍后重试。");
      }

      return nextWords;
    });
  };

  const handleDeleteWordContext = (
    wordId: string,
    contextId: string,
  ) => {
    setSavedWords((currentWords) => {
      const nextWords = currentWords
        .map((word) => {
          if (word.id !== wordId) {
            return word;
          }

          return {
            ...word,
            contexts: word.contexts.filter(
              (context) => context.id !== contextId,
            ),
            updatedAt: new Date().toISOString(),
          };
        })
        .filter((word) => word.contexts.length > 0);

      try {
        writeSavedWords(readingResult.id, nextWords);
        showCollectionMessage("已移除该语境");
      } catch {
        showCollectionMessage("删除语境失败，请稍后重试。");
      }

      return nextWords;
    });
  };

  const handleReasoningDraftChange = (value: string) => {
    setReasoningDrafts((currentDrafts) => ({
      ...currentDrafts,
      [activeQuestion.id]: value,
    }));

    if (reasoningError) {
      setReasoningError("");
    }
  };

  const handleReviewReasoning = async () => {
    if (
      !canReviewReasoning ||
      isReviewingReasoning
    ) {
      return;
    }

    const userReasoning = activeReasoningDraft.trim();

    if (!userReasoning) {
      setReasoningError(
        "请先写下你当时为什么选择这个答案。",
      );
      return;
    }

    const questionSnapshot = activeQuestion;
    const questionUserAnswer =
      questionSnapshot.userAnswer;

    if (!questionUserAnswer) {
      setReasoningError(
        "当前题目没有用户答案，无法进行错因复盘。",
      );
      return;
    }

    const optionsText = questionSnapshot.options
      .map(
        (option) =>
          `${option.key}. ${option.original}\n中文：${option.translation}`,
      )
      .join("\n");

    const optionAnalysisText = questionSnapshot.options
      .map(
        (option) =>
          `${option.key}：${option.analysis}`,
      )
      .join("\n");

    setIsReviewingReasoning(true);
    setReasoningError("");

    try {
      const response = await fetch("/api/review-reasoning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionStem: questionSnapshot.stem,
          options: optionsText,
          correctAnswer: questionSnapshot.correctAnswer,
          userAnswer: questionUserAnswer,
          evidenceQuote: questionSnapshot.evidence.quote,
          optionAnalysis: optionAnalysisText,
          userReasoning,
        }),
      });

      const responseText = await response.text();
      let responseData: ReasoningReviewResponse;

      try {
        responseData = JSON.parse(
          responseText,
        ) as ReasoningReviewResponse;
      } catch {
        throw new Error(
          "错题思路诊断接口返回了无法解析的内容，请检查 review-reasoning/route.ts。",
        );
      }

      if (
        !response.ok ||
        !responseData.reasoning_verdict ||
        !responseData.reasoning_summary ||
        typeof responseData.correct_part !== "string" ||
        !responseData.key_error ||
        !responseData.error_tag ||
        !Array.isArray(responseData.correct_reasoning) ||
        responseData.correct_reasoning.length < 2 ||
        !responseData.correction
      ) {
        throw new Error(
          responseData.error ||
            responseData.details ||
            "错题思路诊断失败，请稍后重试。",
        );
      }

      const result: ReasoningReviewResult = {
        reasoning_verdict:
          responseData.reasoning_verdict,
        reasoning_summary:
          responseData.reasoning_summary,
        correct_part: responseData.correct_part,
        key_error: responseData.key_error,
        error_tag: responseData.error_tag,
        correct_reasoning:
          responseData.correct_reasoning,
        correction: responseData.correction,
      };

      const now = new Date().toISOString();

      setReasoningReviews((currentReviews) => {
        const existingReview =
          currentReviews[questionSnapshot.id];

        const nextReviews = {
          ...currentReviews,
          [questionSnapshot.id]: {
            questionId: questionSnapshot.id,
            userReasoning,
            result,
            createdAt:
              existingReview?.createdAt ?? now,
            updatedAt: now,
          },
        };

        try {
          writeSavedReasoningReviews(
            readingResult.id,
            nextReviews,
          );
        } catch {
          setReasoningError(
            "诊断已经完成，但浏览器本地存储空间不足。",
          );
        }

        return nextReviews;
      });

      setReasoningDrafts((currentDrafts) => ({
        ...currentDrafts,
        [questionSnapshot.id]: userReasoning,
      }));

      showCollectionMessage("错题思路复盘已保存");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "错题思路诊断失败，请稍后重试。";

      setReasoningError(message);
    } finally {
      setIsReviewingReasoning(false);
    }
  };

  const handleDeleteReasoningReview = () => {
    setReasoningReviews((currentReviews) => {
      const nextReviews = { ...currentReviews };
      delete nextReviews[activeQuestion.id];

      try {
        writeSavedReasoningReviews(
          readingResult.id,
          nextReviews,
        );
      } catch {
        setReasoningError("删除复盘记录失败，请稍后重试。");
      }

      return nextReviews;
    });

    setReasoningDrafts((currentDrafts) => ({
      ...currentDrafts,
      [activeQuestion.id]: "",
    }));
    setReasoningError("");
    setIsReasoningOpen(false);
    showCollectionMessage("已删除本题思路复盘");
  };

  const handleDeleteSentence = (sentenceId: string) => {
    setSavedSentences((currentSentences) => {
      const nextSentences = currentSentences.filter(
        (item) => item.id !== sentenceId,
      );

      try {
        writeSavedSentences(
          readingResult.id,
          nextSentences,
        );
        showCollectionMessage("已移除收藏");
      } catch {
        showCollectionMessage("删除收藏失败，请稍后重试。");
      }

      return nextSentences;
    });
  };

  const handleLocateEvidence = () => {
    setSentenceSelection(null);

    const articleContainer = articleScrollRef.current;
    const evidenceElement = evidenceRef.current;

    if (!evidenceElement) return;

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    setIsEvidenceLocated(true);

    const hasIndependentScroll =
      articleContainer !== null &&
      articleContainer.scrollHeight >
        articleContainer.clientHeight + 1;

    if (articleContainer && hasIndependentScroll) {
      const containerRect =
        articleContainer.getBoundingClientRect();

      const evidenceRect =
        evidenceElement.getBoundingClientRect();

      const targetScrollTop =
        articleContainer.scrollTop +
        (evidenceRect.top - containerRect.top) -
        articleContainer.clientHeight / 2 +
        evidenceRect.height / 2;

      articleContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    } else {
      evidenceElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setIsEvidenceLocated(false);
    }, 1800);
  };

  const renderParagraphOriginal = (
    paragraphId: string,
    original: string,
  ): ReactNode => {
    const isEvidenceParagraph =
      paragraphId === activeQuestion.evidence.paragraphId;

    if (!isEvidenceParagraph) {
      return original;
    }

    const evidenceRange = findEvidenceRange(
      original,
      activeQuestion.evidence.quote,
    );

    if (!evidenceRange) {
      return original;
    }

    const beforeEvidence = original.slice(0, evidenceRange.start);
    const evidenceText = original.slice(
      evidenceRange.start,
      evidenceRange.end,
    );
    const afterEvidence = original.slice(evidenceRange.end);

    return (
      <>
        {beforeEvidence}
        <mark
          ref={evidenceRef}
          className={`scroll-mt-28 rounded-md bg-amber-200 px-1 py-0.5 text-slate-900 transition-all duration-300 ${
            isEvidenceLocated
              ? "ring-2 ring-amber-400 ring-offset-2"
              : ""
          }`}
        >
          {evidenceText}
        </mark>
        {afterEvidence}
      </>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              ReadMate AI
            </p>
            <h1 className="text-xl font-bold">英语阅读复盘</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/review"
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              复习中心
            </Link>

            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
            >
              返回资料库
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">本次正确率</p>
            <p className="mt-2 text-3xl font-bold text-indigo-600">
              {formatSummaryAccuracy(summary)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">答题结果</p>
            <p className="mt-2 text-3xl font-bold">
              {gradedQuestionCount > 0
                ? `${summary.correctCount} / ${gradedQuestionCount}`
                : `${summary.totalQuestions} 题已解析`}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              {gradedQuestionCount > 0
                ? "主要错因"
                : "答案来源"}
            </p>
            <p className="mt-3 font-semibold text-rose-600">
              {mainErrorReason}
            </p>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-12">
          <article
            ref={articleScrollRef}
            onMouseUp={handleTextSelection}
            onKeyUp={handleTextSelection}
            onScroll={() => setSentenceSelection(null)}
            className="rounded-2xl bg-white p-7 shadow-sm lg:col-span-7 lg:h-[calc(100vh-14rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <div className="mb-6">
              <p className="text-sm font-medium text-indigo-600">
                阅读文章
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                {article.title}
              </h2>
            </div>

            <div className="space-y-7">
              {article.paragraphs.map((paragraph) => {
                const isEvidenceParagraph =
                  paragraph.id ===
                  activeQuestion.evidence.paragraphId;

                return (
                  <div
                    key={paragraph.id}
                    className="transition-all duration-300"
                  >
                    <p
                      data-english-paragraph-id={paragraph.id}
                      className="whitespace-pre-line text-[18px] font-medium leading-8 text-slate-800 selection:bg-indigo-200"
                    >
                      {renderParagraphOriginal(
                        paragraph.id,
                        paragraph.original,
                      )}
                    </p>

                    <p
                      className={`mt-2 text-[14px] leading-6 ${
                        isEvidenceParagraph
                          ? "text-slate-500"
                          : "text-slate-400"
                      }`}
                    >
                      {paragraph.translation}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:col-span-5 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                题目导航
              </p>

              <div className="mt-4 grid grid-cols-4 gap-3">
                {questions.map((question) => {
                  const questionResult =
                    getQuestionIsCorrect(question);

                  const isActive =
                    question.id === activeQuestionId;

                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() =>
                        handleQuestionChange(question.id)
                      }
                      aria-pressed={isActive}
                      className={`relative rounded-xl border py-3 font-semibold transition ${
                        questionResult === true
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : questionResult === false
                            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "border-indigo-100 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100"
                      } ${
                        isActive
                          ? "ring-2 ring-indigo-500 ring-offset-2"
                          : ""
                      }`}
                    >
                      {question.number}

                      {reasoningReviews[question.id] && (
                        <span
                          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white"
                          aria-label="已完成思路复盘"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className={`rounded-2xl border bg-white p-6 shadow-sm ${
                isActiveQuestionCorrect === true
                  ? "border-emerald-100"
                  : isActiveQuestionCorrect === false
                    ? "border-rose-100"
                    : "border-indigo-100"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isActiveQuestionCorrect === true
                      ? "bg-emerald-100 text-emerald-700"
                      : isActiveQuestionCorrect === false
                        ? "bg-rose-100 text-rose-700"
                        : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  第{activeQuestion.number}题 ·{" "}
                  {isActiveQuestionCorrect === true
                    ? "回答正确"
                    : isActiveQuestionCorrect === false
                      ? isActiveAnswerAiInferred
                        ? "AI判断：可能答错"
                        : "回答错误"
                      : "未作答"}
                </span>

                <span className="shrink-0 text-sm text-slate-500">
                  {activeQuestion.type}
                </span>
              </div>

              <h3 className="mt-5 text-lg font-bold">
                {activeQuestion.stem}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {activeQuestion.stemTranslation}
              </p>

              <div className="mt-5 space-y-3">
                {activeQuestion.options.map((option) => {
                  const isCorrectOption =
                    option.key ===
                    activeQuestion.correctAnswer;

                  const isUserWrongSelection =
                    option.key === activeQuestion.userAnswer &&
                    option.key !==
                      activeQuestion.correctAnswer;

                  const isUserCorrectSelection =
                    option.key === activeQuestion.userAnswer &&
                    isCorrectOption;

                  const cardClass = isCorrectOption
                    ? "border-2 border-emerald-300 bg-emerald-50"
                    : isUserWrongSelection
                      ? "border-2 border-rose-300 bg-rose-50"
                      : "border border-slate-200 bg-white";

                  const letterClass = isCorrectOption
                    ? "bg-emerald-600 text-white"
                    : isUserWrongSelection
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-600";

                  const analysisClass = isCorrectOption
                    ? "font-medium text-emerald-700"
                    : isUserWrongSelection
                      ? "font-medium text-rose-700"
                      : "text-slate-500";

                  return (
                    <div
                      key={option.key}
                      className={`rounded-xl p-4 ${cardClass}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${letterClass}`}
                        >
                          {option.key}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              className={`font-medium ${
                                isCorrectOption ||
                                isUserWrongSelection
                                  ? "text-slate-800"
                                  : "text-slate-700"
                              }`}
                            >
                              {option.original}
                            </p>

                            {isCorrectOption && (
                              <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                {isUserCorrectSelection
                                  ? `${activeAnswerLabel} · 你的选择`
                                  : activeAnswerLabel}
                              </span>
                            )}

                            {isUserWrongSelection && (
                              <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                                你的选择
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm leading-6 text-slate-400">
                            {option.translation}
                          </p>

                          <p
                            className={`mt-2 text-sm leading-6 ${analysisClass}`}
                          >
                            <span
                              className={`font-semibold ${
                                isCorrectOption
                                  ? ""
                                  : isUserWrongSelection
                                    ? "text-rose-700"
                                    : "text-slate-600"
                              }`}
                            >
                              解析：
                            </span>
                            {option.analysis}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isActiveAnswerAiInferred && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <p className="font-semibold">
                    AI参考答案：{activeQuestion.correctAnswer}
                    {activeAnswerConfidence !== null
                      ? ` · 置信度 ${Math.round(
                          activeAnswerConfidence * 100,
                        )}%`
                      : ""}
                  </p>
                  <p className="mt-1 text-amber-700">
                    该答案由 AI 根据文章证据推断，并非官方标准答案，请结合答案册核对。
                  </p>
                </div>
              )}

              {activeQuestion.answerConflict && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  当前答案与原文证据可能存在冲突，请人工核对。
                </div>
              )}

              <div
                className={`mt-5 rounded-xl p-4 ${
                  isActiveQuestionCorrect === true
                    ? "bg-emerald-50"
                    : isActiveQuestionCorrect === false
                      ? "bg-amber-50"
                      : "bg-indigo-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    isActiveQuestionCorrect === true
                      ? "text-emerald-800"
                      : isActiveQuestionCorrect === false
                        ? "text-amber-800"
                        : "text-indigo-800"
                  }`}
                >
                  {isActiveQuestionCorrect === true
                    ? "答题分析"
                    : isActiveQuestionCorrect === false
                      ? isActiveAnswerAiInferred
                        ? "AI判断与错因参考"
                        : "错因分析"
                      : "答案解析"}
                </p>

                <p className="mt-2 leading-7 text-slate-700">
                  {activeQuestion.reviewAnalysis}
                </p>
              </div>

              {hasActiveUserAnswer &&
                isActiveQuestionCorrect === false && (
                  <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3">
                    <p className="text-sm font-semibold text-rose-700">
                      已自动记录到错题本
                    </p>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      看懂上面的解析后，可以不写复盘；仍然不清楚自己为什么选错时，再填写做题思路。
                    </p>
                  </div>
                )}

              {canReviewReasoning && (
                <section className="mt-5 overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/50">
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-indigo-700">
                        错题复盘（选填）
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        这道错题已经自动保存。需要进一步梳理时，再写下你当时为什么选择
                        {activeQuestion.userAnswer}，AI
                        会指出具体偏差并还原更合理的推理路径。
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsReasoningOpen((current) => !current);
                        setReasoningError("");
                      }}
                      className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                    >
                      {isReasoningOpen
                        ? "收起"
                        : activeReasoningReview
                          ? "查看复盘"
                          : "写复盘"}
                    </button>
                  </div>

                  {isReasoningOpen && (
                    <div className="border-t border-indigo-100 bg-white px-5 py-5">
                      <label
                        htmlFor={`reasoning-${activeQuestion.id}`}
                        className="text-sm font-semibold text-slate-700"
                      >
                        我当时的做题思路
                      </label>

                      <textarea
                        id={`reasoning-${activeQuestion.id}`}
                        value={activeReasoningDraft}
                        onChange={(event) =>
                          handleReasoningDraftChange(
                            event.target.value,
                          )
                        }
                        disabled={isReviewingReasoning}
                        placeholder="例如：我看到选项C中出现了原文相关词，所以认为它是答案；或者我把题目理解成在问优点……"
                        className="mt-3 min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-70"
                      />

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-slate-400">
                          请尽量写清楚定位依据、关键词理解和排除选项的过程。
                        </p>

                        <button
                          type="button"
                          onClick={handleReviewReasoning}
                          disabled={
                            isReviewingReasoning ||
                            !activeReasoningDraft.trim()
                          }
                          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                        >
                          {isReviewingReasoning
                            ? "正在分析..."
                            : activeReasoningReview
                              ? "重新分析"
                              : "分析我的思路"}
                        </button>
                      </div>

                      {reasoningError && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                          {reasoningError}
                        </div>
                      )}

                      {isReviewingReasoning && (
                        <div className="mt-4 flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                          <p className="text-sm font-medium text-indigo-700">
                            正在对比你的思路、原文证据和各选项……
                          </p>
                        </div>
                      )}

                      {activeReasoningReview && (
                        <div className="mt-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                                {getReasoningVerdictLabel(
                                  activeReasoningReview.result
                                    .reasoning_verdict,
                                )}
                              </span>

                              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                                {getReasoningErrorTagLabel(
                                  activeReasoningReview.result
                                    .error_tag,
                                )}
                              </span>
                            </div>

                            <span className="text-xs text-slate-400">
                              更新于{" "}
                              {formatSavedDate(
                                activeReasoningReview.updatedAt,
                              )}
                            </span>
                          </div>

                          <div className="rounded-xl border border-slate-200 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              你的原思路
                            </p>
                            <p className="mt-2 text-sm leading-7 text-slate-700">
                              {
                                activeReasoningReview.result
                                  .reasoning_summary
                              }
                            </p>
                          </div>

                          {activeReasoningReview.result
                            .correct_part && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                做对的部分
                              </p>
                              <p className="mt-2 text-sm leading-7 text-slate-700">
                                {
                                  activeReasoningReview.result
                                    .correct_part
                                }
                              </p>
                            </div>
                          )}

                          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                              关键错误点
                            </p>
                            <p className="mt-2 text-sm leading-7 text-slate-700">
                              {
                                activeReasoningReview.result
                                  .key_error
                              }
                            </p>
                          </div>

                          <div className="rounded-xl border border-indigo-200 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                              正确推理路径
                            </p>

                            <ol className="mt-4 space-y-3">
                              {activeReasoningReview.result.correct_reasoning.map(
                                (step, index) => (
                                  <li
                                    key={`${activeQuestion.id}-reasoning-step-${index}`}
                                    className="flex items-start gap-3"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                      {index + 1}
                                    </span>
                                    <p className="pt-0.5 text-sm leading-7 text-slate-700">
                                      {step}
                                    </p>
                                  </li>
                                ),
                              )}
                            </ol>
                          </div>

                          <div className="rounded-xl bg-amber-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                              下次这样改
                            </p>
                            <p className="mt-2 text-sm font-medium leading-7 text-slate-700">
                              {
                                activeReasoningReview.result
                                  .correction
                              }
                            </p>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={
                                handleDeleteReasoningReview
                              }
                              className="text-sm font-medium text-slate-400 transition hover:text-rose-600"
                            >
                              删除本题复盘
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {hasActiveUserAnswer &&
                isActiveQuestionCorrect === false &&
                isActiveAnswerAiInferred &&
                !canReviewReasoning && (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    AI 对该题答案的把握不足，暂不将其作为确定错题进行思路诊断，请先核对官方答案。
                  </div>
                )}

              <button
                type="button"
                onClick={handleLocateEvidence}
                className="mt-5 w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-700"
              >
                定位原文证据
              </button>
            </section>
          </aside>
        </div>
      </section>

      <div className="fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-3 xl:flex">
        <button
          type="button"
          onClick={() => {
            setSentenceSelection(null);
            setCollectionTab("sentences");
            setIsCollectionOpen(true);
          }}
          className="group flex w-20 flex-col items-center rounded-2xl bg-indigo-600 px-3 py-4 text-white shadow-xl shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700"
          aria-label="查看本篇收藏"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"
            />
          </svg>

          <span className="mt-2 text-sm font-semibold leading-5">
            本篇收藏
          </span>

          <span className="mt-2 flex min-w-7 items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
            {savedSentences.length + savedWords.length}
          </span>
        </button>

        <div className="w-20 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm">
          <p className="text-xs font-semibold leading-5 text-slate-600">
            选中单词查词
            <br />
            选中句子收藏
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setSentenceSelection(null);
          setCollectionTab("sentences");
          setIsCollectionOpen(true);
        }}
        className="fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-200 transition hover:bg-indigo-700 xl:hidden"
        aria-label="查看本篇收藏"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z"
          />
        </svg>
        本篇收藏
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
          {savedSentences.length + savedWords.length}
        </span>
      </button>

      {sentenceSelection && (
        <div
          ref={selectionToolbarRef}
          style={{
            left: sentenceSelection.left,
            top: sentenceSelection.top,
          }}
          className={`fixed z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ${
            sentenceSelection.placement === "above"
              ? "-translate-y-full"
              : ""
          }`}
        >
          {sentenceSelection.isSingleWord && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleLookupSelectedWord}
              disabled={isLookingUpWord}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:bg-indigo-400"
            >
              {isLookingUpWord ? "正在查词..." : "查词"}
            </button>
          )}

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleAddSelectedSentence}
            disabled={isTranslatingSentence}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
              sentenceSelection.isDuplicate
                ? "bg-slate-700 text-white hover:bg-slate-800"
                : sentenceSelection.isSingleWord
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {sentenceSelection.isDuplicate
              ? "句子已收藏"
              : isTranslatingSentence
                ? "正在翻译..."
                : sentenceSelection.isSingleWord
                  ? "翻译收藏"
                  : "翻译并收藏"}
          </button>
        </div>
      )}

      {activeWordCard && (
        <>
          <button
            type="button"
            aria-label="关闭单词卡"
            onClick={() => setActiveWordCard(null)}
            className="fixed inset-0 z-[65] bg-slate-950/35 backdrop-blur-[1px]"
          />

          <section className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-indigo-600 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-indigo-100">
                    AI 单词卡
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <h2 className="text-3xl font-bold">
                      {activeWordCard.result.lemma}
                    </h2>

                    {activeWordCard.result.phonetic && (
                      <span className="text-base text-indigo-100">
                        {activeWordCard.result.phonetic}
                      </span>
                    )}
                  </div>

                  {normalizeLemma(activeWordCard.result.word) !==
                    normalizeLemma(activeWordCard.result.lemma) && (
                    <p className="mt-2 text-sm text-indigo-100">
                      原文词形：{activeWordCard.result.word}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveWordCard(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl transition hover:bg-white/25"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  通用词典释义
                </p>

                <div className="mt-3 space-y-3">
                  {activeWordCard.result.common_definitions.map(
                    (definition, index) => (
                      <div
                        key={`active-word-definition-${index}`}
                        className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"
                      >
                        <span className="shrink-0 rounded-md bg-white px-2 py-1 text-sm font-bold text-indigo-600 shadow-sm">
                          {definition.part_of_speech}
                        </span>
                        <p className="leading-7 text-slate-700">
                          {definition.meanings.join("；")}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  当前文章中的含义
                </p>
                <p className="mt-2 text-lg font-bold text-slate-800">
                  {activeWordCard.result.context_part_of_speech}{" "}
                  {activeWordCard.result.context_meaning}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {activeWordCard.result.source_sentence}
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setActiveWordCard(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                暂不收藏
              </button>

              <button
                type="button"
                onClick={handleSaveActiveWord}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700"
              >
                收藏到本篇单词本
              </button>
            </div>
          </section>
        </>
      )}

      {isCollectionOpen && (
        <>
          <button
            type="button"
            aria-label="关闭本篇收藏"
            onClick={() => setIsCollectionOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
          />

          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 pb-0 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">
                    本篇复习内容
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    收藏与复习
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCollectionOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 transition hover:bg-slate-200"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCollectionTab("sentences")}
                  className={`rounded-t-xl border-b-2 px-4 py-3 text-sm font-semibold transition ${
                    collectionTab === "sentences"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-transparent text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  句子收藏
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs">
                    {savedSentences.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCollectionTab("words")}
                  className={`rounded-t-xl border-b-2 px-4 py-3 text-sm font-semibold transition ${
                    collectionTab === "words"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-transparent text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  本篇单词本
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs">
                    {savedWords.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {collectionTab === "sentences" ? (
                savedSentences.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
                    <p className="font-semibold text-slate-700">
                      还没有收藏句子
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      在左侧文章中选中英文句子或短语，然后点击“翻译并收藏”。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savedSentences.map((sentence, index) => (
                      <article
                        key={sentence.id}
                        className="rounded-2xl border border-slate-200 p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
                            {index + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSentence(sentence.id)
                            }
                            className="shrink-0 text-sm font-medium text-slate-400 transition hover:text-rose-600"
                          >
                            删除
                          </button>
                        </div>

                        <p className="mt-4 text-[16px] font-semibold leading-7 text-slate-800">
                          {sentence.text}
                        </p>

                        <div className="mt-4 rounded-xl bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-slate-400">
                            精准翻译
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {sentence.translation}
                          </p>
                        </div>

                        <p className="mt-3 text-xs text-slate-400">
                          收藏于{" "}
                          {formatSavedDate(sentence.createdAt)}
                        </p>
                      </article>
                    ))}
                  </div>
                )
              ) : savedWords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
                  <p className="font-semibold text-slate-700">
                    本篇单词本还是空的
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    在左侧文章中只选中一个英文单词，点击“查词”，查看单词卡后收藏。
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {savedWords.map((word) => (
                    <article
                      key={word.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      <div className="flex items-start justify-between gap-4 bg-indigo-50 px-5 py-4">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h3 className="text-xl font-bold text-slate-900">
                              {word.lemma}
                            </h3>
                            {word.phonetic && (
                              <span className="text-sm text-indigo-600">
                                {word.phonetic}
                              </span>
                            )}
                          </div>

                          {normalizeLemma(word.word) !==
                            normalizeLemma(word.lemma) && (
                            <p className="mt-1 text-xs text-slate-500">
                              原文词形：{word.word}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteWord(word.id)}
                          className="shrink-0 text-sm font-medium text-slate-400 transition hover:text-rose-600"
                        >
                          删除单词
                        </button>
                      </div>

                      <div className="px-5 py-4">
                        <div className="space-y-2">
                          {word.commonDefinitions.map(
                            (definition, definitionIndex) => (
                              <div
                                key={`${word.id}-definition-${definitionIndex}`}
                                className="flex items-start gap-3 text-sm leading-6"
                              >
                                <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">
                                  {definition.part_of_speech}
                                </span>
                                <p className="text-slate-700">
                                  {definition.meanings.join("；")}
                                </p>
                              </div>
                            ),
                          )}
                        </div>

                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            文章语境 · {word.contexts.length}
                          </p>

                          <div className="mt-3 space-y-3">
                            {word.contexts.map((context) => (
                              <div
                                key={context.id}
                                className="rounded-xl bg-slate-50 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold text-indigo-700">
                                    {context.partOfSpeech}{" "}
                                    {context.meaning}
                                  </p>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteWordContext(
                                        word.id,
                                        context.id,
                                      )
                                    }
                                    className="shrink-0 text-xs text-slate-400 transition hover:text-rose-600"
                                  >
                                    移除语境
                                  </button>
                                </div>

                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                  {context.sourceSentence}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <p className="text-xs leading-5 text-slate-400">
                句子和单词均按本篇阅读材料保存，数据目前仅保存在本浏览器。
              </p>
            </div>
          </aside>
        </>
      )}

      {collectionMessage && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {collectionMessage}
        </div>
      )}
    </main>
  );
}
