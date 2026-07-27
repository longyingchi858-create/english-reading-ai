export type OptionKey = "A" | "B" | "C" | "D";

export type AnswerSource =
  | "user_provided"
  | "ai_inferred";

export type GradingStatus =
  | "officially_graded"
  | "ai_graded"
  | "ungraded";

export type ArticleParagraph = {
  id: string;
  original: string;
  translation: string;
};

export type ReadingArticle = {
  title: string;
  paragraphs: ArticleParagraph[];
};

export type QuestionOption = {
  key: OptionKey;
  original: string;
  translation: string;
  analysis: string;
};

export type QuestionEvidence = {
  paragraphId: string;
  quote: string;
  translation: string;
};

export type ReadingQuestion = {
  id: string;
  number: number;
  type: string;
  stem: string;
  stemTranslation: string;
  correctAnswer: OptionKey;
  userAnswer: OptionKey | null;
  answerSource: AnswerSource;
  answerConfidence: number | null;
  gradingStatus: GradingStatus;
  isCorrect: boolean | null;
  answerConflict: boolean;
  options: QuestionOption[];
  evidence: QuestionEvidence;
  errorTags: string[];
  reviewAnalysis: string;
};

export type ReadingSummary = {
  totalQuestions: number;
  gradedQuestions: number;
  correctCount: number;
  accuracy: number | null;
  primaryErrorTag: string | null;
  aiInferredCount: number;
};

export type ReadingResult = {
  id: string;
  article: ReadingArticle;
  summary: ReadingSummary;
  questions: ReadingQuestion[];
};
