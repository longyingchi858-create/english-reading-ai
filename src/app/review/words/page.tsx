"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  formatSavedDate,
  deleteWordReviewStatus,
  getAggregatedWordReviewItems,
  readWordCollectionStore,
  updateWordReviewStatus,
  writeActiveResultId,
  writeSavedWords,
} from "@/lib/reviewStorage";

import type {
  AggregatedWordReviewItem,
  WordReviewStatus,
} from "@/lib/reviewStorage";

type SentenceTranslationState = {
  translation: string;
  isLoading: boolean;
  error: string;
};

type SentenceTranslationResponse = {
  translation?: string;
  error?: string;
};

const SENTENCE_TRANSLATION_CACHE_KEY =
  "readmate-word-sentence-translations-v1";

function normalizeSentence(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function getSentenceTranslationKey(
  sentence: string,
): string {
  return normalizeSentence(sentence);
}

function readTranslationCache(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      SENTENCE_TRANSLATION_CACHE_KEY,
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          Boolean(key) && typeof value === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeTranslationCache(
  cache: Record<string, string>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SENTENCE_TRANSLATION_CACHE_KEY,
    JSON.stringify(cache),
  );
}

function normalizeLemma(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function openReading(readingId: string): void {
  writeActiveResultId(readingId);
  window.location.assign("/");
}

function removeWordFromAllReadings(
  lemma: string,
): void {
  const target = normalizeLemma(lemma);
  const store = readWordCollectionStore();

  Object.entries(store).forEach(
    ([readingId, words]) => {
      const remainingWords = words.filter(
        (word) =>
          normalizeLemma(word.lemma) !== target,
      );

      writeSavedWords(readingId, remainingWords);
    },
  );
}

function WordReviewContent() {
  const searchParams = useSearchParams();
  const requestedLemma =
    searchParams.get("lemma")?.trim() ?? "";

  const [items, setItems] = useState<
    AggregatedWordReviewItem[]
  >([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [hasLoaded, setHasLoaded] =
    useState(false);

  const [
    isExplanationVisible,
    setIsExplanationVisible,
  ] = useState(false);

  const [
    sentenceTranslations,
    setSentenceTranslations,
  ] = useState<
    Record<string, SentenceTranslationState>
  >({});

  useEffect(() => {
    const nextItems =
      getAggregatedWordReviewItems();

    setItems(nextItems);
    setHasLoaded(true);

    if (nextItems.length === 0) {
      setCurrentIndex(0);
      return;
    }

    if (requestedLemma) {
      const requestedIndex =
        nextItems.findIndex(
          (item) =>
            normalizeLemma(item.lemma) ===
            normalizeLemma(requestedLemma),
        );

      setCurrentIndex(
        requestedIndex >= 0 ? requestedIndex : 0,
      );
      return;
    }

    setCurrentIndex(0);
  }, [requestedLemma]);

  const currentItem = items[currentIndex] ?? null;

  useEffect(() => {
    setIsExplanationVisible(false);
  }, [currentItem?.lemma]);

  const translateSentence = async (
    sentence: string,
    force = false,
  ): Promise<void> => {
    const normalizedSentence =
      normalizeSentence(sentence);

    if (!normalizedSentence) {
      return;
    }

    const translationKey =
      getSentenceTranslationKey(
        normalizedSentence,
      );

    const cache = readTranslationCache();

    if (!force && cache[translationKey]) {
      setSentenceTranslations((current) => ({
        ...current,
        [translationKey]: {
          translation: cache[translationKey],
          isLoading: false,
          error: "",
        },
      }));

      return;
    }

    setSentenceTranslations((current) => ({
      ...current,
      [translationKey]: {
        translation:
          current[translationKey]?.translation ?? "",
        isLoading: true,
        error: "",
      },
    }));

    try {
      const response = await fetch(
        "/api/translate-sentence",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedText: normalizedSentence,
            paragraphContext: normalizedSentence,
          }),
        },
      );

      const payload =
        (await response.json()) as
          SentenceTranslationResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ||
            `句子翻译失败（${response.status}）`,
        );
      }

      const translation =
        payload.translation?.trim();

      if (!translation) {
        throw new Error(
          "句子翻译接口没有返回翻译结果。",
        );
      }

      const nextCache = {
        ...readTranslationCache(),
        [translationKey]: translation,
      };

      writeTranslationCache(nextCache);

      setSentenceTranslations((current) => ({
        ...current,
        [translationKey]: {
          translation,
          isLoading: false,
          error: "",
        },
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "句子翻译失败，请稍后重试。";

      setSentenceTranslations((current) => ({
        ...current,
        [translationKey]: {
          translation:
            current[translationKey]?.translation ?? "",
          isLoading: false,
          error: message,
        },
      }));
    }
  };

  useEffect(() => {
    if (
      !currentItem ||
      !isExplanationVisible
    ) {
      return;
    }

    const sentences = Array.from(
      new Set(
        currentItem.sources.flatMap((source) =>
          source.contexts
            .map((context) =>
              normalizeSentence(
                context.sourceSentence,
              ),
            )
            .filter(Boolean),
        ),
      ),
    );

    sentences.forEach((sentence) => {
      const translationKey =
        getSentenceTranslationKey(sentence);

      const currentState =
        sentenceTranslations[translationKey];

      if (
        currentState?.translation ||
        currentState?.isLoading
      ) {
        return;
      }

      void translateSentence(sentence);
    });
  }, [currentItem, isExplanationVisible]);

  const progressText = useMemo(() => {
    if (!currentItem || items.length === 0) {
      return "0 / 0";
    }

    return `${currentIndex + 1} / ${items.length}`;
  }, [currentIndex, currentItem, items.length]);

  const goPrevious = () => {
    if (items.length === 0) {
      return;
    }

    setCurrentIndex((index) =>
      index === 0 ? items.length - 1 : index - 1,
    );
  };

  const goNext = () => {
    if (items.length === 0) {
      return;
    }

    setCurrentIndex((index) =>
      index === items.length - 1 ? 0 : index + 1,
    );
  };

  const handleRemoveCurrentWord = () => {
    if (!currentItem) {
      return;
    }

    const confirmed = window.confirm(
      `确定要取消收藏“${currentItem.lemma}”吗？该单词在所有文章中的收藏记录都会被移除。`,
    );

    if (!confirmed) {
      return;
    }

    removeWordFromAllReadings(currentItem.lemma);
    deleteWordReviewStatus(currentItem.lemma);

    const nextItems =
      getAggregatedWordReviewItems();

    setItems(nextItems);

    if (nextItems.length === 0) {
      setCurrentIndex(0);
      return;
    }

    setCurrentIndex((index) =>
      Math.min(index, nextItems.length - 1),
    );
  };

  const handleSetReviewStatus = (
    status: WordReviewStatus,
  ) => {
    if (!currentItem) {
      return;
    }

    const statusRecord =
      updateWordReviewStatus(
        currentItem.lemma,
        status,
      );

    setItems((currentItems) =>
      currentItems.map((item) =>
        normalizeLemma(item.lemma) ===
        normalizeLemma(currentItem.lemma)
          ? {
              ...item,
              reviewStatus: statusRecord.status,
              statusUpdatedAt:
                statusRecord.updatedAt,
            }
          : item,
      ),
    );

    setIsExplanationVisible(true);
  };

  if (!hasLoaded) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            正在读取单词本……
          </p>
        </div>
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
        <h2 className="text-xl font-bold text-slate-800">
          单词本已经空了
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
          回到阅读文章中继续查词和收藏，新的单词会重新出现在这里。
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/review"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            返回复习中心
          </Link>

          <Link
            href="/"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            返回阅读页
          </Link>
        </div>
      </div>
    );
  }

  const totalContexts =
    currentItem.sources.reduce(
      (sum, source) =>
        sum + source.contexts.length,
      0,
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <p className="shrink-0 text-sm font-semibold text-slate-500">
          {progressText}
        </p>

        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{
              width: `${
                ((currentIndex + 1) /
                  items.length) *
                100
              }%`,
            }}
          />
        </div>
      </div>

      <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-indigo-100 bg-indigo-50 px-6 py-8 text-center sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
            当前单词
          </p>

          <h1 className="mt-4 break-words text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {currentItem.lemma}
          </h1>

          {currentItem.phonetic && (
            <p className="mt-3 text-base text-indigo-600">
              {currentItem.phonetic}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <p className="text-sm text-slate-500">
              出现在 {currentItem.sources.length} 篇文章中，共保存 {totalContexts} 个语境
            </p>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                currentItem.reviewStatus === "mastered"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {currentItem.reviewStatus === "mastered"
                ? "已掌握"
                : "继续复习"}
            </span>
          </div>
        </div>

        <section className="border-b border-slate-100 bg-white px-6 py-6 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">
                先判断你对这个单词的掌握程度
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                选择后才会显示释义和文章语境，避免提前看到答案。
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={
                  currentItem.reviewStatus ===
                  "reviewing"
                }
                onClick={() =>
                  handleSetReviewStatus(
                    "reviewing",
                  )
                }
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  isExplanationVisible &&
                  currentItem.reviewStatus ===
                    "reviewing"
                    ? "border-amber-300 bg-amber-50 text-amber-700 ring-4 ring-amber-100"
                    : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                }`}
              >
                继续复习
              </button>

              <button
                type="button"
                aria-pressed={
                  currentItem.reviewStatus ===
                  "mastered"
                }
                onClick={() =>
                  handleSetReviewStatus(
                    "mastered",
                  )
                }
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                  isExplanationVisible &&
                  currentItem.reviewStatus ===
                    "mastered"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-100"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                已掌握
              </button>
            </div>
          </div>
        </section>

        <div className="space-y-6 px-6 py-7 sm:px-10">
          {!isExplanationVisible ? (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm">
                🔒
              </div>

              <p className="mt-4 text-base font-semibold text-slate-800">
                释义暂时隐藏
              </p>

              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
                请先根据记忆判断“继续复习”或“已掌握”，选择后即可查看单词意思和文章语境。
              </p>
            </div>
          ) : (
            <>
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              单词意思
            </p>

            <div className="mt-4 space-y-3">
              {currentItem.commonDefinitions.length >
              0 ? (
                currentItem.commonDefinitions.map(
                  (definition, index) => (
                    <div
                      key={`${currentItem.lemma}-definition-${index}`}
                      className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4"
                    >
                      <span className="mt-0.5 shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-indigo-600 shadow-sm">
                        {definition.part_of_speech}
                      </span>

                      <p className="text-base leading-8 text-slate-700">
                        {definition.meanings.join("；")}
                      </p>
                    </div>
                  ),
                )
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  暂未保存通用释义。
                </p>
              )}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              文章中的意思
            </p>

            <div className="mt-4 space-y-4">
              {currentItem.sources.map((source) => (
                <div
                  key={`${currentItem.lemma}-${source.readingId}`}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {source.readingTitle}
                      </p>

                      {normalizeLemma(
                        source.originalWord,
                      ) !==
                        normalizeLemma(
                          currentItem.lemma,
                        ) && (
                        <p className="mt-1 text-xs text-slate-400">
                          原文词形：
                          {source.originalWord}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openReading(source.readingId)
                      }
                      className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
                    >
                      打开原文章
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {source.contexts.map(
                      (context) => (
                        <div
                          key={context.id}
                          className="rounded-xl bg-slate-50 p-4"
                        >
                          <p className="text-sm font-semibold text-indigo-700">
                            {context.partOfSpeech}{" "}
                            {context.meaning}
                          </p>

                          <div className="mt-2 rounded-xl bg-white p-3">
                            <p className="text-sm leading-7 text-slate-700">
                              {context.sourceSentence}
                            </p>

                            {(() => {
                              const translationKey =
                                getSentenceTranslationKey(
                                  context.sourceSentence,
                                );

                              const translationState =
                                sentenceTranslations[
                                  translationKey
                                ];

                              if (
                                translationState?.isLoading
                              ) {
                                return (
                                  <p className="mt-2 border-t border-slate-100 pt-2 text-sm text-slate-400">
                                    正在翻译……
                                  </p>
                                );
                              }

                              if (
                                translationState?.translation
                              ) {
                                return (
                                  <p className="mt-2 border-t border-slate-100 pt-2 text-sm leading-7 text-slate-500">
                                    {
                                      translationState.translation
                                    }
                                  </p>
                                );
                              }

                              if (
                                translationState?.error
                              ) {
                                return (
                                  <div className="mt-2 border-t border-slate-100 pt-2">
                                    <p className="text-sm leading-6 text-rose-500">
                                      {
                                        translationState.error
                                      }
                                    </p>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void translateSentence(
                                          context.sourceSentence,
                                          true,
                                        )
                                      }
                                      className="mt-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
                                    >
                                      重新翻译
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void translateSentence(
                                      context.sourceSentence,
                                    )
                                  }
                                  className="mt-2 border-t border-slate-100 pt-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
                                >
                                  翻译句子
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-right text-xs text-slate-400">
            最近更新于{" "}
            {formatSavedDate(
              currentItem.lastUpdatedAt,
            )}
          </p>
            </>
          )}
        </div>
      </article>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <button
          type="button"
          onClick={goPrevious}
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          上一个
        </button>

        <button
          type="button"
          onClick={handleRemoveCurrentWord}
          className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          取消收藏
        </button>

        <button
          type="button"
          onClick={goNext}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          下一个
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/review"
          className="text-sm font-semibold text-slate-500 transition hover:text-indigo-700"
        >
          返回单词列表
        </Link>

        <span className="text-slate-300">·</span>

        <Link
          href="/"
          className="text-sm font-semibold text-slate-500 transition hover:text-indigo-700"
        >
          返回阅读页
        </Link>
      </div>
    </div>
  );
}

export default function WordsReviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              ReadMate 单词本
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              逐个复习单词
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              先判断掌握状态，再查看释义和文章语境。
            </p>
          </div>

          <Link
            href="/review"
            className="w-fit rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            返回复习中心
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <Suspense
          fallback={
            <div className="flex min-h-[520px] items-center justify-center">
              <p className="text-sm text-slate-500">
                正在打开单词本……
              </p>
            </div>
          }
        >
          <WordReviewContent />
        </Suspense>
      </div>
    </main>
  );
}
