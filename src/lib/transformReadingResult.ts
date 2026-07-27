import type {
  AnswerSource,
  GradingStatus,
  OptionKey,
  ReadingResult,
} from "@/types/reading";

/** Dify 工作流最终输出。 */
export type DifyWorkflowOutput = {
  material_json: string | DifyMaterialResult;
  analysis_json: string | DifyAnalysisResult;
  quality_score?: number;
  validation_error?: string;
  error?: string;
};

export type DifyMaterialResult = {
  article_title?: string;
  article?: string;
  article_paragraphs: DifyArticleParagraph[];
  questions: DifyMaterialQuestion[];
};

export type DifyArticleParagraph = {
  paragraph_id: string;
  original: string;
};

export type DifyMaterialQuestion = {
  question_no: number;
  stem: string;
  options: Record<OptionKey, string>;
  correct_answer?: string;
  user_answer?: string;
  answer_source?: string;
};

export type DifyAnalysisResult = {
  article_translations: DifyArticleTranslation[];
  questions: DifyAnalysisQuestion[];
};

export type DifyArticleTranslation = {
  paragraph_id: string;
  translation: string;
};

export type DifyAnalysisQuestion = {
  question_no: number;
  stem_translation: string;
  option_translations: Record<OptionKey, string>;
  correct_answer: string;
  user_answer?: string;
  answer_source?: string;
  answer_confidence?: number;
  grading_status?: string;
  is_correct: boolean | null;
  question_type: string;
  evidence_quote: string;
  evidence_translation: string;
  correct_reason: string;
  option_analysis: Record<OptionKey, string>;
  error_tag: string;
  error_reason: string;
  answer_conflict: boolean;
  confidence?: number;
};

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

const ERROR_TAG_LABELS: Record<string, string> = {
  detail_mislocation: "细节定位错误",
  question_focus_reversal: "审题方向反转",
  scope_expansion: "范围扩大或缩小",
  causal_reversal: "因果关系颠倒",
  inference_overreach: "过度推断",
  vocabulary_misread: "词义理解错误",
  unknown: "其他错因",
};

export function transformReadingResult(
  workflowOutput: DifyWorkflowOutput,
  resultId = "reading-result",
): ReadingResult {
  validateWorkflowStatus(workflowOutput);

  const material = parseJsonObject<DifyMaterialResult>(
    workflowOutput.material_json,
    "material_json",
  );

  const analysis = parseJsonObject<DifyAnalysisResult>(
    workflowOutput.analysis_json,
    "analysis_json",
  );

  validateTopLevelFields(material, analysis);

  const translationMap = new Map(
    analysis.article_translations.map((item) => [
      String(item.paragraph_id),
      item.translation,
    ]),
  );

  const analysisQuestionMap = new Map(
    analysis.questions.map((question) => [
      Number(question.question_no),
      question,
    ]),
  );

  const articleParagraphs = material.article_paragraphs.map(
    (paragraph) => {
      const paragraphId = String(paragraph.paragraph_id);
      const translation = translationMap.get(paragraphId);

      if (!translation?.trim()) {
        throw new Error(`段落 ${paragraphId} 缺少中文翻译。`);
      }

      if (!paragraph.original?.trim()) {
        throw new Error(`段落 ${paragraphId} 缺少英文原文。`);
      }

      return {
        id: paragraphId,
        original: paragraph.original,
        translation,
      };
    },
  );

  const questions = material.questions.map((sourceQuestion) => {
    const questionNumber = Number(sourceQuestion.question_no);
    const parsedQuestion = analysisQuestionMap.get(questionNumber);

    if (!parsedQuestion) {
      throw new Error(`第 ${questionNumber} 题缺少解析结果。`);
    }

    const suppliedCorrectAnswer = toOptionalOptionKey(
      sourceQuestion.correct_answer,
      `第 ${questionNumber} 题输入标准答案`,
    );

    const inferredOrConfirmedAnswer = toOptionKey(
      parsedQuestion.correct_answer,
      `第 ${questionNumber} 题解析答案`,
    );

    if (
      suppliedCorrectAnswer &&
      suppliedCorrectAnswer !== inferredOrConfirmedAnswer
    ) {
      throw new Error(
        `第 ${questionNumber} 题的用户提供答案在解析过程中被改变。`,
      );
    }

    const sourceUserAnswer = toOptionalOptionKey(
      sourceQuestion.user_answer,
      `第 ${questionNumber} 题用户答案`,
    );

    const parsedUserAnswer = toOptionalOptionKey(
      parsedQuestion.user_answer,
      `第 ${questionNumber} 题解析结果中的用户答案`,
    );

    if (parsedUserAnswer !== sourceUserAnswer) {
      throw new Error(
        `第 ${questionNumber} 题的用户答案在解析过程中被改变。`,
      );
    }

    const answerSource = readAnswerSource(
      parsedQuestion.answer_source ?? sourceQuestion.answer_source,
      suppliedCorrectAnswer ? "user_provided" : "ai_inferred",
    );

    if (suppliedCorrectAnswer && answerSource !== "user_provided") {
      throw new Error(
        `第 ${questionNumber} 题已提供标准答案，但答案来源不是 user_provided。`,
      );
    }

    if (!suppliedCorrectAnswer && answerSource !== "ai_inferred") {
      throw new Error(
        `第 ${questionNumber} 题未提供标准答案，但答案来源不是 ai_inferred。`,
      );
    }

    const gradingStatus = readGradingStatus(
      parsedQuestion.grading_status,
      sourceUserAnswer
        ? answerSource === "user_provided"
          ? "officially_graded"
          : "ai_graded"
        : "ungraded",
    );

    const expectedIsCorrect = sourceUserAnswer
      ? inferredOrConfirmedAnswer === sourceUserAnswer
      : null;

    if (parsedQuestion.is_correct !== expectedIsCorrect) {
      throw new Error(
        `第 ${questionNumber} 题的正误状态与答案不一致。`,
      );
    }

    const evidenceQuote = parsedQuestion.evidence_quote?.trim();

    if (!evidenceQuote) {
      throw new Error(`第 ${questionNumber} 题缺少原文证据。`);
    }

    const paragraphId = findEvidenceParagraphId(
      material.article_paragraphs,
      evidenceQuote,
    );

    if (!paragraphId) {
      throw new Error(
        `第 ${questionNumber} 题的 evidence_quote 无法匹配到任何文章段落。`,
      );
    }

    const answerConfidence = readConfidence(
      parsedQuestion.answer_confidence ?? parsedQuestion.confidence,
      answerSource === "user_provided" ? 1 : null,
    );

    const errorTag = parsedQuestion.error_tag?.trim() ?? "";

    return {
      id: `q${questionNumber}`,
      number: questionNumber,
      type: parsedQuestion.question_type?.trim() || "其他题型",
      stem: sourceQuestion.stem,
      stemTranslation: parsedQuestion.stem_translation,
      correctAnswer: inferredOrConfirmedAnswer,
      userAnswer: sourceUserAnswer,
      answerSource,
      answerConfidence,
      gradingStatus,
      isCorrect: expectedIsCorrect,
      answerConflict: parsedQuestion.answer_conflict === true,

      options: OPTION_KEYS.map((key) => ({
        key,
        original: readRequiredOption(
          sourceQuestion.options,
          key,
          `第 ${questionNumber} 题英文选项`,
        ),
        translation: readRequiredOption(
          parsedQuestion.option_translations,
          key,
          `第 ${questionNumber} 题选项翻译`,
        ),
        analysis: readRequiredOption(
          parsedQuestion.option_analysis,
          key,
          `第 ${questionNumber} 题选项解析`,
        ),
      })),

      evidence: {
        paragraphId,
        quote: evidenceQuote,
        translation: parsedQuestion.evidence_translation,
      },

      errorTags: errorTag ? [errorTag] : [],

      reviewAnalysis:
        expectedIsCorrect === false
          ? parsedQuestion.error_reason || parsedQuestion.correct_reason
          : parsedQuestion.correct_reason,
    };
  });

  const totalQuestions = questions.length;
  const gradedQuestions = questions.filter(
    (question) => question.userAnswer !== null,
  ).length;
  const correctCount = questions.filter(
    (question) => question.isCorrect === true,
  ).length;
  const accuracy =
    gradedQuestions > 0
      ? Math.round((correctCount / gradedQuestions) * 100)
      : null;

  const primaryErrorTagCode = findPrimaryErrorTag(
    questions
      .filter((question) => question.isCorrect === false)
      .flatMap((question) => question.errorTags),
  );

  return {
    id: resultId,
    article: {
      title: material.article_title?.trim() || "Reading Passage",
      paragraphs: articleParagraphs,
    },
    summary: {
      totalQuestions,
      gradedQuestions,
      correctCount,
      accuracy,
      primaryErrorTag: primaryErrorTagCode
        ? ERROR_TAG_LABELS[primaryErrorTagCode] ?? primaryErrorTagCode
        : null,
      aiInferredCount: questions.filter(
        (question) => question.answerSource === "ai_inferred",
      ).length,
    },
    questions,
  };
}

function validateWorkflowStatus(output: DifyWorkflowOutput): void {
  if (output.error?.trim()) {
    throw new Error(`Dify 工作流执行失败：${output.error}`);
  }

  if (output.validation_error?.trim()) {
    throw new Error(`Dify 质量校验未通过：${output.validation_error}`);
  }

  if (
    typeof output.quality_score === "number" &&
    output.quality_score < 1
  ) {
    throw new Error(`Dify 质量校验分数不足：${output.quality_score}`);
  }
}

function validateTopLevelFields(
  material: DifyMaterialResult,
  analysis: DifyAnalysisResult,
): void {
  if (!Array.isArray(material.article_paragraphs)) {
    throw new Error("material_json.article_paragraphs 不是数组。");
  }
  if (!Array.isArray(material.questions)) {
    throw new Error("material_json.questions 不是数组。");
  }
  if (!Array.isArray(analysis.article_translations)) {
    throw new Error("analysis_json.article_translations 不是数组。");
  }
  if (!Array.isArray(analysis.questions)) {
    throw new Error("analysis_json.questions 不是数组。");
  }
  if (material.article_paragraphs.length === 0) {
    throw new Error("文章段落为空。");
  }
  if (material.questions.length === 0) {
    throw new Error("题目列表为空。");
  }
  if (material.questions.length !== analysis.questions.length) {
    throw new Error(
      `材料题目数为 ${material.questions.length}，解析题目数为 ${analysis.questions.length}，两者不一致。`,
    );
  }
}

function parseJsonObject<T>(value: string | T, fieldName: string): T {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) throw new Error(`${fieldName} 为空。`);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${fieldName} JSON 解析失败：${message}`);
  }
}

function toOptionKey(value: unknown, fieldName: string): OptionKey {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!OPTION_KEYS.includes(normalized as OptionKey)) {
    throw new Error(
      `${fieldName} 必须是 A、B、C 或 D，当前值为：${String(value)}`,
    );
  }
  return normalized as OptionKey;
}

function toOptionalOptionKey(
  value: unknown,
  fieldName: string,
): OptionKey | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return toOptionKey(normalized, fieldName);
}

function readAnswerSource(
  value: unknown,
  fallback: AnswerSource,
): AnswerSource {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (normalized === "user_provided" || normalized === "ai_inferred") {
    return normalized;
  }
  throw new Error(`答案来源无效：${normalized}`);
}

function readGradingStatus(
  value: unknown,
  fallback: GradingStatus,
): GradingStatus {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (
    normalized === "officially_graded" ||
    normalized === "ai_graded" ||
    normalized === "ungraded"
  ) {
    return normalized;
  }
  throw new Error(`评分状态无效：${normalized}`);
}

function readConfidence(
  value: unknown,
  fallback: number | null,
): number | null {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.min(1, numberValue));
}

function readRequiredOption(
  options: Partial<Record<OptionKey, string>> | undefined,
  key: OptionKey,
  fieldName: string,
): string {
  const value = options?.[key];
  if (!value?.trim()) throw new Error(`${fieldName}缺少 ${key}。`);
  return value;
}

function findEvidenceParagraphId(
  paragraphs: DifyArticleParagraph[],
  evidenceQuote: string,
): string | null {
  const normalizedEvidence = normalizeForMatch(evidenceQuote);
  if (!normalizedEvidence) return null;
  const matchedParagraph = paragraphs.find((paragraph) =>
    normalizeForMatch(paragraph.original).includes(normalizedEvidence),
  );
  return matchedParagraph ? String(matchedParagraph.paragraph_id) : null;
}

function normalizeForMatch(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findPrimaryErrorTag(
  tags: Array<string | null | undefined>,
): string | null {
  const counts = new Map<string, number>();
  let primaryTag: string | null = null;
  let highestCount = 0;
  for (const rawTag of tags) {
    const tag = rawTag?.trim();
    if (!tag) continue;
    const nextCount = (counts.get(tag) ?? 0) + 1;
    counts.set(tag, nextCount);
    if (nextCount > highestCount) {
      highestCount = nextCount;
      primaryTag = tag;
    }
  }
  return primaryTag;
}
