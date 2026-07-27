"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  formatSavedDate,
  getSentenceReviewItems,
  removeSavedSentence,
  writeActiveResultId,
} from "@/lib/reviewStorage";

import type {
  SentenceReviewItem,
} from "@/lib/reviewStorage";

function openReading(readingId: string): void {
  writeActiveResultId(readingId);
  window.location.assign("/");
}

function getInitialIndex(
  items: SentenceReviewItem[],
): number {
  if (
    typeof window === "undefined" ||
    items.length === 0
  ) {
    return 0;
  }

  const params = new URLSearchParams(
    window.location.search,
  );

  const readingId =
    params.get("readingId")?.trim() ?? "";

  const sentenceId =
    params.get("sentenceId")?.trim() ?? "";

  if (!readingId || !sentenceId) {
    return 0;
  }

  const matchedIndex = items.findIndex(
    (item) =>
      item.readingId === readingId &&
      item.sentence.id === sentenceId,
  );

  return matchedIndex >= 0
    ? matchedIndex
    : 0;
}

function replaceCurrentUrl(
  item: SentenceReviewItem,
): void {
  const query = new URLSearchParams({
    readingId: item.readingId,
    sentenceId: item.sentence.id,
  });

  window.history.replaceState(
    null,
    "",
    `/review/sentences?${query.toString()}`,
  );
}

export default function SentenceReviewPage() {
  const [items, setItems] = useState<
    SentenceReviewItem[]
  >([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [hasLoaded, setHasLoaded] =
    useState(false);

  useEffect(() => {
    const nextItems =
      getSentenceReviewItems();

    setItems(nextItems);
    setCurrentIndex(
      getInitialIndex(nextItems),
    );
    setHasLoaded(true);
  }, []);

  const currentItem =
    items[currentIndex] ?? null;

  const hasPrevious =
    currentIndex > 0;

  const hasNext =
    currentIndex < items.length - 1;

  const progress = useMemo(() => {
    if (items.length === 0) {
      return 0;
    }

    return (
      ((currentIndex + 1) /
        items.length) *
      100
    );
  }, [currentIndex, items.length]);

  useEffect(() => {
    if (currentItem) {
      replaceCurrentUrl(currentItem);
    }
  }, [currentItem]);

  const goToIndex = (nextIndex: number) => {
    if (items.length === 0) {
      return;
    }

    setCurrentIndex(
      Math.max(
        0,
        Math.min(
          items.length - 1,
          nextIndex,
        ),
      ),
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleRemove = () => {
    if (!currentItem) {
      return;
    }

    const confirmed = window.confirm(
      "确定要取消收藏这句话吗？",
    );

    if (!confirmed) {
      return;
    }

    removeSavedSentence(
      currentItem.readingId,
      currentItem.sentence.id,
    );

    const nextItems = items.filter(
      (item) =>
        !(
          item.readingId ===
            currentItem.readingId &&
          item.sentence.id ===
            currentItem.sentence.id
        ),
    );

    setItems(nextItems);

    if (nextItems.length === 0) {
      setCurrentIndex(0);
      return;
    }

    setCurrentIndex((index) =>
      Math.min(
        index,
        nextItems.length - 1,
      ),
    );
  };

  if (!hasLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            正在读取句子收藏……
          </p>
        </div>
      </main>
    );
  }

  if (!currentItem) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
        <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
            ◇
          </div>

          <h1 className="mt-5 text-xl font-bold">
            没有可复习的句子
          </h1>

          <p className="mt-2 text-sm leading-7 text-slate-500">
            返回复习中心查看其他收藏内容。
          </p>

          <Link
            href="/review"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            返回复习中心
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              ReadMate 句子复习
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              逐句复习
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              每次只复习一句，通过上一句和下一句连续查看。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/review"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              返回句子清单
            </Link>

            <button
              type="button"
              onClick={() =>
                openReading(
                  currentItem.readingId,
                )
              }
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              打开原文章
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="shrink-0 text-sm font-semibold text-slate-500">
              {currentIndex + 1} / {items.length}
            </p>

            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        </section>

        <article className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-indigo-50/70 px-6 py-7 sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              来源文章
            </p>

            <h2 className="mt-2 text-lg font-bold text-slate-900">
              {currentItem.readingTitle}
            </h2>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-10">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                英文原句
              </p>

              <p className="mt-3 text-xl font-semibold leading-10 text-slate-900">
                {currentItem.sentence.text}
              </p>
            </section>

            <div className="h-px bg-slate-100" />

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                精准翻译
              </p>

              <div className="mt-3 rounded-2xl bg-slate-50 px-5 py-4">
                <p className="text-base leading-8 text-slate-600">
                  {currentItem.sentence.translation ||
                    "暂无翻译"}
                </p>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
              <p className="text-xs text-slate-400">
                收藏于{" "}
                {formatSavedDate(
                  currentItem.sentence
                    .createdAt,
                )}
              </p>

              <button
                type="button"
                onClick={handleRemove}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                取消收藏
              </button>
            </div>
          </div>
        </article>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              goToIndex(currentIndex - 1)
            }
            disabled={!hasPrevious}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一句
          </button>

          <button
            type="button"
            onClick={() =>
              goToIndex(currentIndex + 1)
            }
            disabled={!hasNext}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一句
          </button>
        </div>
      </div>
    </main>
  );
}
