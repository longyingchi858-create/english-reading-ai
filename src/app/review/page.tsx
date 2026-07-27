"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  formatSavedDate,
  getAggregatedWordReviewItems,
  getReasoningReviewItems,
  dismissMistake,
  getSentenceReviewItems,
  removeSavedReasoningReview,
  writeActiveQuestionId,
  writeActiveResultId,
} from "@/lib/reviewStorage";

import type {
  AggregatedWordReviewItem,
  ReasoningErrorTag,
  ReasoningReviewItem,
  ReasoningVerdict,
  SentenceReviewItem,
} from "@/lib/reviewStorage";

type ReviewTab = "mistakes" | "words" | "sentences";

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesSearch(
  searchText: string,
  values: Array<string | number | null | undefined>,
): boolean {
  if (!searchText) {
    return true;
  }

  return values.some((value) =>
    normalizeSearchText(String(value ?? "")).includes(
      searchText,
    ),
  );
}

function openReading(
  readingId: string,
  questionId?: string,
): void {
  writeActiveResultId(readingId);

  if (questionId) {
    writeActiveQuestionId(questionId);
  }

  window.location.assign("/");
}

function getVerdictLabel(
  verdict: ReasoningVerdict,
): string {
  const labels: Record<ReasoningVerdict, string> = {
    correct_but_answer_mistake:
      "思路基本正确，最终作答失误",
    partially_correct: "部分思路正确",
    incorrect: "核心思路存在偏差",
    insufficient_information: "思路信息不足",
  };

  return labels[verdict];
}

function getErrorTagLabel(
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

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
        ◇
      </div>

      <h3 className="mt-5 text-lg font-bold text-slate-800">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
        {description}
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        返回阅读页
      </Link>
    </div>
  );
}

function MistakeReviewCard({
  item,
  onRemove,
}: {
  item: ReasoningReviewItem;
  onRemove: () => void;
}) {
  const reviewRecord = item.review;
  const answerLabel =
    item.answerSource === "ai_inferred"
      ? "AI参考答案"
      : "正确答案";

  const answerConfidence =
    item.answerSource === "ai_inferred" &&
    item.answerConfidence !== null
      ? ` · ${Math.round(
          item.answerConfidence * 100,
        )}%`
      : "";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {item.readingTitle}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold leading-7 text-slate-900">
                {item.questionNumber > 0
                  ? `第 ${item.questionNumber} 题`
                  : "错题记录"}
              </h3>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  reviewRecord
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {reviewRecord
                  ? "已写复盘"
                  : "仅记录错题"}
              </span>

              {item.answerSource ===
                "ai_inferred" && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                  AI判题
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                openReading(item.readingId)
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              返回原文章
            </button>

            <button
              type="button"
              onClick={() =>
                openReading(
                  item.readingId,
                  item.questionId,
                )
              }
              className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              {reviewRecord
                ? "查看或修改复盘"
                : "写错题复盘"}
            </button>

            <button
              type="button"
              onClick={onRemove}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              从错题本移除
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm leading-7 text-slate-600">
          {item.questionStem}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            我的答案：{item.userAnswer || "未记录"}
          </span>

          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {answerLabel}：{item.correctAnswer || "未记录"}
            {answerConfidence}
          </span>

          {reviewRecord && (
            <>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                {getVerdictLabel(
                  reviewRecord.result
                    .reasoning_verdict,
                )}
              </span>

              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {getErrorTagLabel(
                  reviewRecord.result.error_tag,
                )}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {!reviewRecord ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                当前错题解析
              </p>

              <p className="mt-2 text-sm leading-7 text-slate-700">
                {item.questionAnalysis ||
                  "这道题已经记录到错题本。"}
              </p>
            </section>

            {item.evidenceQuote && (
              <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  原文证据
                </p>

                <p className="mt-2 text-sm font-medium leading-7 text-slate-700">
                  {item.evidenceQuote}
                </p>

                {item.evidenceTranslation && (
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    {item.evidenceTranslation}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-dashed border-indigo-200 bg-white p-5 text-center">
              <p className="text-sm font-semibold text-slate-800">
                复盘是选填的
              </p>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
                已经看懂题目解析时，可以只保留这条错题记录；仍然不清楚自己为什么选错时，再写下当时的做题思路让 AI 帮你分析。
              </p>

              <button
                type="button"
                onClick={() =>
                  openReading(
                    item.readingId,
                    item.questionId,
                  )
                }
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                写错题复盘
              </button>
            </section>

            <p className="text-right text-xs text-slate-400">
              自动记录于{" "}
              {formatSavedDate(
                item.recordCreatedAt,
              )}
            </p>
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                我当时的做题思路
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {reviewRecord.userReasoning}
              </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  做对的部分
                </p>

                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {reviewRecord.result.correct_part ||
                    "暂未识别出明确正确部分。"}
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  关键错误点
                </p>

                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {reviewRecord.result.key_error}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                正确推理路径
              </p>

              <ol className="mt-4 space-y-3">
                {reviewRecord.result.correct_reasoning.map(
                  (step, index) => (
                    <li
                      key={`${item.readingId}-${item.questionId}-${index}`}
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
            </section>

            <section className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                下次这样改
              </p>

              <p className="mt-2 text-sm font-medium leading-7 text-slate-700">
                {reviewRecord.result.correction}
              </p>
            </section>

            <p className="text-right text-xs text-slate-400">
              更新于{" "}
              {formatSavedDate(
                reviewRecord.updatedAt,
              )}
            </p>
          </>
        )}
      </div>
    </article>
  );
}

function SentenceInventory({
  items,
  searchText,
}: {
  items: SentenceReviewItem[];
  searchText: string;
}) {
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        includesSearch(searchText, [
          item.readingTitle,
          item.sentence.text,
          item.sentence.translation,
        ]),
      ),
    [items, searchText],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="句子收藏还是空的"
        description="在文章中选中英文句子并完成翻译收藏后，会在这里显示。"
      />
    );
  }

  if (filteredItems.length === 0) {
    return (
      <EmptyState
        title="没有找到匹配的句子"
        description="请更换关键词或清空搜索内容。"
      />
    );
  }

  const firstItem = filteredItems[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            我的句子
          </p>

          <p className="mt-1 text-xs text-slate-400">
            共收藏 {filteredItems.length} 句，点击任意句子进入逐句复习。
          </p>
        </div>

        <Link
          href={`/review/sentences?readingId=${encodeURIComponent(
            firstItem.readingId,
          )}&sentenceId=${encodeURIComponent(
            firstItem.sentence.id,
          )}`}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          开始复习
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredItems.map((item) => (
          <Link
            key={`${item.readingId}-${item.sentence.id}`}
            href={`/review/sentences?readingId=${encodeURIComponent(
              item.readingId,
            )}&sentenceId=${encodeURIComponent(
              item.sentence.id,
            )}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="min-w-0 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                {item.readingTitle}
              </p>

              <span className="shrink-0 text-xs text-slate-400">
                {formatSavedDate(
                  item.sentence.createdAt,
                )}
              </span>
            </div>

            <p className="mt-4 line-clamp-3 text-base font-semibold leading-8 text-slate-800 transition group-hover:text-indigo-700">
              {item.sentence.text}
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="line-clamp-2 text-sm leading-7 text-slate-500">
                {item.sentence.translation ||
                  "暂无翻译"}
              </p>
            </div>

            <p className="mt-4 text-right text-sm font-semibold text-indigo-600">
              进入复习 →
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReviewPager({
  currentIndex,
  total,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: {
  currentIndex: number;
  total: number;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <p className="shrink-0 text-sm font-semibold text-slate-500">
          {total > 0
            ? `${currentIndex + 1} / ${total}`
            : "0 / 0"}
        </p>

        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{
              width:
                total > 0
                  ? `${((currentIndex + 1) / total) * 100}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
        >
          {previousLabel}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function WordInventory({
  items,
  searchText,
}: {
  items: AggregatedWordReviewItem[];
  searchText: string;
}) {
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        includesSearch(searchText, [
          item.lemma,
          item.phonetic,
          ...item.sources.map(
            (source) => source.readingTitle,
          ),
        ]),
      ),
    [items, searchText],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="单词本还是空的"
        description="在文章中选中一个英文单词，完成查词并收藏后，会在这里显示。"
      />
    );
  }

  if (filteredItems.length === 0) {
    return (
      <EmptyState
        title="没有找到匹配的单词"
        description="请更换关键词或清空搜索内容。"
      />
    );
  }

  const masteredCount = filteredItems.filter(
    (item) => item.reviewStatus === "mastered",
  ).length;

  const reviewingCount =
    filteredItems.length - masteredCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            我的单词
          </p>

          <p className="mt-1 text-xs text-slate-400">
            继续复习 {reviewingCount} 个 · 已掌握 {masteredCount} 个
          </p>
        </div>

        <Link
          href="/review/words"
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          开始复习
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredItems.map((item) => (
          <Link
            key={normalizeSearchText(item.lemma)}
            href={`/review/words?lemma=${encodeURIComponent(
              item.lemma,
            )}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-bold text-slate-900 transition group-hover:text-indigo-700">
                  {item.lemma}
                </h3>

                {item.phonetic && (
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {item.phonetic}
                  </p>
                )}
              </div>

              <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                {item.sources.length}篇
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  item.reviewStatus === "mastered"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.reviewStatus === "mastered"
                  ? "已掌握"
                  : "继续复习"}
              </span>

              <span className="text-sm font-semibold text-indigo-600">
                进入复习 →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const [activeTab, setActiveTab] =
    useState<ReviewTab>("words");

  const [searchValue, setSearchValue] = useState("");

  const [mistakeItems, setMistakeItems] = useState<
    ReasoningReviewItem[]
  >([]);

  const [wordItems, setWordItems] = useState<
    AggregatedWordReviewItem[]
  >([]);

  const [sentenceItems, setSentenceItems] = useState<
    SentenceReviewItem[]
  >([]);

  const [mistakeIndex, setMistakeIndex] =
    useState(0);

  const [hasLoaded, setHasLoaded] = useState(false);

  const loadReviewData = () => {
    setMistakeItems(getReasoningReviewItems());
    setWordItems(getAggregatedWordReviewItems());
    setSentenceItems(getSentenceReviewItems());
    setHasLoaded(true);
  };

  useEffect(() => {
    loadReviewData();

    const handleStorage = () => {
      loadReviewData();
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage,
      );
    };
  }, []);

  const normalizedSearch =
    normalizeSearchText(searchValue);

  const filteredMistakes = useMemo(
    () =>
      mistakeItems.filter((item) =>
        includesSearch(normalizedSearch, [
          item.readingTitle,
          item.questionNumber,
          item.questionStem,
          item.userAnswer,
          item.correctAnswer,
          item.questionAnalysis,
          item.evidenceQuote,
          item.review?.userReasoning ?? "",
          item.review?.result.key_error ?? "",
          item.review?.result.correction ?? "",
          item.review
            ? getErrorTagLabel(
                item.review.result.error_tag,
              )
            : "",
        ]),
      ),
    [mistakeItems, normalizedSearch],
  );

  const filteredSentences = useMemo(
    () =>
      sentenceItems.filter((item) =>
        includesSearch(normalizedSearch, [
          item.readingTitle,
          item.sentence.text,
          item.sentence.translation,
        ]),
      ),
    [sentenceItems, normalizedSearch],
  );

  useEffect(() => {
    setMistakeIndex((index) => {
      if (filteredMistakes.length === 0) {
        return 0;
      }

      return Math.min(
        index,
        filteredMistakes.length - 1,
      );
    });
  }, [filteredMistakes.length]);

  const currentMistake =
    filteredMistakes[mistakeIndex] ?? null;

  const handleRemoveMistake = (
    item: ReasoningReviewItem,
  ) => {
    const confirmed = window.confirm(
      `确定要把第 ${item.questionNumber || ""} 题从错题本中移除吗？`,
    );

    if (!confirmed) {
      return;
    }

    dismissMistake(
      item.readingId,
      item.questionId,
    );

    removeSavedReasoningReview(
      item.readingId,
      item.questionId,
    );

    loadReviewData();
  };

  const reviewedMistakeCount =
    mistakeItems.filter(
      (item) => item.review !== null,
    ).length;

  const pendingMistakeCount =
    mistakeItems.length -
    reviewedMistakeCount;

  const activeCount =
    activeTab === "mistakes"
      ? filteredMistakes.length
      : activeTab === "words"
        ? wordItems.filter((item) =>
            includesSearch(normalizedSearch, [
              item.lemma,
              item.phonetic,
              ...item.sources.map(
                (source) => source.readingTitle,
              ),
            ]),
          ).length
        : filteredSentences.length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              ReadMate 复习中心
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              我的复习资料
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              查看自动记录的错题、收藏单词和句子。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadReviewData}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              刷新数据
            </button>

            <Link
              href="/"
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              返回阅读页
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("mistakes");
              setSearchValue("");
              setMistakeIndex(0);
            }}
            className={`rounded-2xl border p-5 text-left transition ${
              activeTab === "mistakes"
                ? "border-indigo-300 bg-indigo-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-indigo-200"
            }`}
          >
            <p className="text-sm font-semibold text-slate-500">
              错题本
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {mistakeItems.length}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              已复盘 {reviewedMistakeCount} 题 · 待复盘 {pendingMistakeCount} 题
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("words");
              setSearchValue("");
            }}
            className={`rounded-2xl border p-5 text-left transition ${
              activeTab === "words"
                ? "border-indigo-300 bg-indigo-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-indigo-200"
            }`}
          >
            <p className="text-sm font-semibold text-slate-500">
              单词本
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {wordItems.length}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              查看单词清单并逐个复习
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("sentences");
              setSearchValue("");
            }}
            className={`rounded-2xl border p-5 text-left transition ${
              activeTab === "sentences"
                ? "border-indigo-300 bg-indigo-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-indigo-200"
            }`}
          >
            <p className="text-sm font-semibold text-slate-500">
              句子收藏
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {sentenceItems.length}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              回顾英文原句与精准翻译
            </p>
          </button>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {activeTab === "mistakes"
                  ? "错题本"
                  : activeTab === "words"
                    ? "单词本"
                    : "句子收藏"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                当前显示 {activeCount} 条内容
              </p>
            </div>

            <input
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);

                if (activeTab === "mistakes") {
                  setMistakeIndex(0);
                }

              }}
              placeholder={
                activeTab === "mistakes"
                  ? "搜索文章、题干或错因"
                  : activeTab === "words"
                    ? "搜索单词或文章"
                    : "搜索英文句子、翻译或文章"
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 sm:max-w-md"
            />
          </div>
        </section>

        <section className="mt-6">
          {!hasLoaded ? (
            <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
              <div className="text-center">
                <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />

                <p className="mt-4 text-sm font-medium text-slate-500">
                  正在读取复习数据……
                </p>
              </div>
            </div>
          ) : activeTab === "words" ? (
            <WordInventory
              items={wordItems}
              searchText={normalizedSearch}
            />
          ) : activeTab === "mistakes" ? (
            currentMistake ? (
              <div className="mx-auto max-w-4xl space-y-5">
                <ReviewPager
                  currentIndex={mistakeIndex}
                  total={filteredMistakes.length}
                  previousLabel="上一题"
                  nextLabel="下一题"
                  onPrevious={() =>
                    setMistakeIndex((index) =>
                      Math.max(0, index - 1),
                    )
                  }
                  onNext={() =>
                    setMistakeIndex((index) =>
                      Math.min(
                        filteredMistakes.length - 1,
                        index + 1,
                      ),
                    )
                  }
                />

                <MistakeReviewCard
                  key={`${currentMistake.readingId}-${currentMistake.questionId}`}
                  item={currentMistake}
                  onRemove={() =>
                    handleRemoveMistake(
                      currentMistake,
                    )
                  }
                />
              </div>
            ) : (
              <EmptyState
                title={
                  normalizedSearch
                    ? "没有找到匹配的错题"
                    : "还没有错题记录"
                }
                description={
                  normalizedSearch
                    ? "请更换关键词或清空搜索内容。"
                    : "完成带用户答案的阅读解析后，答错的题会自动记录在这里；是否填写复盘由你决定。"
                }
              />
            )
          ) : (
            <SentenceInventory
              items={sentenceItems}
              searchText={normalizedSearch}
            />
          )}
        </section>
      </div>
    </main>
  );
}
