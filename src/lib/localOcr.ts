import {
  createScheduler,
  createWorker,
  OEM,
  PSM,
} from "tesseract.js";

const DEFAULT_LANGUAGE = "eng";
const DEFAULT_MAX_WORKERS = 2;
const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MIN_LONG_EDGE = 1400;
const MAX_LONG_EDGE = 2200;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

type SchedulerInstance = ReturnType<typeof createScheduler>;
type WorkerInstance = Awaited<ReturnType<typeof createWorker>>;

type WorkerLoggerMessage = {
  workerId?: string;
  jobId?: string;
  status?: string;
  progress?: number;
};

export type LocalOcrPhase =
  | "validating"
  | "loading-model"
  | "preprocessing"
  | "recognizing"
  | "completed";

export type LocalOcrProgress = {
  phase: LocalOcrPhase;
  progress: number;
  currentFile: number;
  totalFiles: number;
  fileName: string;
  message: string;
};

export type LocalOcrPageResult = {
  pageIndex: number;
  fileName: string;
  text: string;
  confidence: number | null;
  characterCount: number;
};

export type LocalOcrResult = {
  pages: LocalOcrPageResult[];
  combinedText: string;
  totalCharacterCount: number;
  averageConfidence: number | null;
  elapsedMs: number;
};

export type LocalOcrOptions = {
  maxWorkers?: number;
  maxFiles?: number;
  maxFileSizeBytes?: number;
  preprocess?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: LocalOcrProgress) => void;
};

let schedulerPromise: Promise<SchedulerInstance> | null = null;
let activeProgressListener:
  | ((message: WorkerLoggerMessage) => void)
  | null = null;
let recognitionInProgress = false;

function createAbortError(): Error {
  const error = new Error("OCR 已取消。");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeOcrText(text: string): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

function isSupportedImage(file: File): boolean {
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
    SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file.name))
  );
}

function validateFiles(
  files: File[],
  maxFiles: number,
  maxFileSizeBytes: number,
): void {
  if (files.length === 0) {
    throw new Error("请至少选择一张图片。");
  }

  if (files.length > maxFiles) {
    throw new Error(`一次最多识别 ${maxFiles} 张图片。`);
  }

  for (const file of files) {
    if (!file.name.trim()) {
      throw new Error("存在缺少文件名的图片。");
    }

    if (file.size === 0) {
      throw new Error(`图片“${file.name}”是空文件。`);
    }

    if (file.size > maxFileSizeBytes) {
      const maxSizeMb = Math.round(maxFileSizeBytes / 1024 / 1024);
      throw new Error(`图片“${file.name}”超过 ${maxSizeMb} MB。`);
    }

    if (!isSupportedImage(file)) {
      throw new Error(
        `不支持“${file.name}”的格式。请使用 JPG、PNG 或 WEBP。`,
      );
    }
  }
}

function resolveWorkerCount(
  requestedWorkers: number,
  fileCount: number,
): number {
  const hardwareConcurrency =
    typeof navigator !== "undefined"
      ? navigator.hardwareConcurrency || 2
      : 2;

  const safeHardwareLimit = Math.max(1, hardwareConcurrency - 1);

  return clamp(
    Math.floor(requestedWorkers),
    1,
    Math.min(
      DEFAULT_MAX_WORKERS,
      safeHardwareLimit,
      fileCount,
    ),
  );
}

function emitProgress(
  callback: LocalOcrOptions["onProgress"] | undefined,
  progress: LocalOcrProgress,
): void {
  callback?.({
    ...progress,
    progress: clamp(progress.progress, 0, 1),
  });
}

async function createConfiguredWorker(): Promise<WorkerInstance> {
  const worker = await createWorker(
    DEFAULT_LANGUAGE,
    OEM.LSTM_ONLY,
    {
      cacheMethod: "write",
      logger: (message: WorkerLoggerMessage) => {
        activeProgressListener?.(message);
      },
      errorHandler: (error: unknown) => {
        console.error("Tesseract.js worker error", error);
      },
    },
  );

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  return worker;
}

async function getScheduler(
  workerCount: number,
): Promise<SchedulerInstance> {
  if (schedulerPromise) {
    const scheduler = await schedulerPromise;

    if (scheduler.getNumWorkers() === workerCount) {
      return scheduler;
    }

    await scheduler.terminate();
    schedulerPromise = null;
  }

  schedulerPromise = (async () => {
    const scheduler = createScheduler();

    const workers = await Promise.all(
      Array.from({ length: workerCount }, () => createConfiguredWorker()),
    );

    workers.forEach((worker) => {
      scheduler.addWorker(worker);
    });

    return scheduler;
  })();

  try {
    return await schedulerPromise;
  } catch (error) {
    schedulerPromise = null;
    throw error;
  }
}

async function imageBitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const longEdge = Math.max(bitmap.width, bitmap.height);

  let scale = 1;

  if (longEdge < MIN_LONG_EDGE) {
    scale = MIN_LONG_EDGE / longEdge;
  } else if (longEdge > MAX_LONG_EDGE) {
    scale = MAX_LONG_EDGE / longEdge;
  }

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: false,
  });

  if (!context) {
    throw new Error("浏览器无法创建图片处理画布。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("图片预处理失败。"));
      },
      "image/jpeg",
      0.92,
    );
  });
}

async function preprocessImage(file: File): Promise<Blob> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    throw new Error("本地 OCR 只能在浏览器中运行。");
  }

  if (typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file);

  try {
    return await imageBitmapToBlob(bitmap);
  } finally {
    bitmap.close();
  }
}

function buildCombinedText(pages: LocalOcrPageResult[]): string {
  return pages
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function calculateAverageConfidence(
  pages: LocalOcrPageResult[],
): number | null {
  const values = pages
    .map((page) => page.confidence)
    .filter(
      (confidence): confidence is number =>
        typeof confidence === "number" &&
        Number.isFinite(confidence),
    );

  if (values.length === 0) {
    return null;
  }

  const average =
    values.reduce((sum, confidence) => sum + confidence, 0) /
    values.length;

  return Math.round(average * 10) / 10;
}

/**
 * 在浏览器本地识别多张英语图片。
 *
 * 返回页面顺序与传入 files 顺序一致。
 * 图片乱序重排和多文章筛选应交给后续文本整理流程。
 */
export async function recognizeEnglishImages(
  files: File[],
  options: LocalOcrOptions = {},
): Promise<LocalOcrResult> {
  if (recognitionInProgress) {
    throw new Error(
      "已有一个 OCR 任务正在运行，请等待完成后再试。",
    );
  }

  recognitionInProgress = true;
  const startedAt = performance.now();

  const {
    maxWorkers = DEFAULT_MAX_WORKERS,
    maxFiles = DEFAULT_MAX_FILES,
    maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
    preprocess = true,
    signal,
    onProgress,
  } = options;

  try {
    throwIfAborted(signal);

    emitProgress(onProgress, {
      phase: "validating",
      progress: 0,
      currentFile: 0,
      totalFiles: files.length,
      fileName: "",
      message: "正在检查图片……",
    });

    validateFiles(files, maxFiles, maxFileSizeBytes);

    const workerCount = resolveWorkerCount(maxWorkers, files.length);

    emitProgress(onProgress, {
      phase: "loading-model",
      progress: 0.03,
      currentFile: 0,
      totalFiles: files.length,
      fileName: "",
      message: "正在加载本地英文 OCR 模型……",
    });

    const scheduler = await getScheduler(workerCount);
    throwIfAborted(signal);

    const preparedImages: Blob[] = [];

    for (let index = 0; index < files.length; index += 1) {
      throwIfAborted(signal);
      const file = files[index];

      emitProgress(onProgress, {
        phase: "preprocessing",
        progress: 0.08 + (index / files.length) * 0.12,
        currentFile: index + 1,
        totalFiles: files.length,
        fileName: file.name,
        message: `正在优化第 ${index + 1}/${files.length} 张图片……`,
      });

      preparedImages.push(
        preprocess ? await preprocessImage(file) : file,
      );
    }

    const workerProgress = new Map<string, number>();
    let completedCount = 0;

    activeProgressListener = (message: WorkerLoggerMessage) => {
      if (
        message.status !== "recognizing text" ||
        typeof message.progress !== "number"
      ) {
        return;
      }

      const workerKey =
        message.workerId || message.jobId || "worker";

      workerProgress.set(workerKey, message.progress);

      const values = Array.from(workerProgress.values());
      const activeAverage =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) /
            values.length
          : 0;

      const activeWorkerCount = Math.min(
        workerCount,
        files.length - completedCount,
      );

      const overallRecognitionProgress =
        (completedCount + activeAverage * activeWorkerCount) /
        files.length;

      emitProgress(onProgress, {
        phase: "recognizing",
        progress: 0.2 + overallRecognitionProgress * 0.78,
        currentFile: Math.min(completedCount + 1, files.length),
        totalFiles: files.length,
        fileName: "",
        message: `正在本地识别文字，已完成 ${completedCount}/${files.length} 张……`,
      });
    };

    const jobs = preparedImages.map(async (image, index) => {
      throwIfAborted(signal);

      const result = await scheduler.addJob("recognize", image);

      throwIfAborted(signal);
      completedCount += 1;

      const text = normalizeOcrText(result.data.text);
      const confidence =
        typeof result.data.confidence === "number"
          ? Math.round(result.data.confidence * 10) / 10
          : null;

      emitProgress(onProgress, {
        phase: "recognizing",
        progress: 0.2 + (completedCount / files.length) * 0.78,
        currentFile: completedCount,
        totalFiles: files.length,
        fileName: files[index].name,
        message: `已识别 ${completedCount}/${files.length} 张图片`,
      });

      return {
        pageIndex: index + 1,
        fileName: files[index].name,
        text,
        confidence,
        characterCount: text.replace(/\s/g, "").length,
      } satisfies LocalOcrPageResult;
    });

    const pages = (await Promise.all(jobs)).sort(
      (left, right) => left.pageIndex - right.pageIndex,
    );

    const combinedText = buildCombinedText(pages);

    if (!combinedText) {
      throw new Error(
        "没有从图片中识别到文字。请检查图片是否清晰、方向是否正确。",
      );
    }

    const result: LocalOcrResult = {
      pages,
      combinedText,
      totalCharacterCount: combinedText.replace(/\s/g, "").length,
      averageConfidence: calculateAverageConfidence(pages),
      elapsedMs: Math.round(performance.now() - startedAt),
    };

    emitProgress(onProgress, {
      phase: "completed",
      progress: 1,
      currentFile: files.length,
      totalFiles: files.length,
      fileName: "",
      message: `OCR 完成，共识别 ${result.totalCharacterCount} 个非空白字符。`,
    });

    return result;
  } catch (error) {
    if (
      signal?.aborted &&
      !(error instanceof Error && error.name === "AbortError")
    ) {
      throw createAbortError();
    }

    throw error;
  } finally {
    activeProgressListener = null;
    recognitionInProgress = false;
  }
}

/**
 * 主动释放本地 OCR Worker。
 * 不建议每次识别后调用，否则下次会重新加载模型。
 */
export async function terminateLocalOcr(): Promise<void> {
  const currentSchedulerPromise = schedulerPromise;

  schedulerPromise = null;
  activeProgressListener = null;

  if (!currentSchedulerPromise) {
    return;
  }

  try {
    const scheduler = await currentSchedulerPromise;
    await scheduler.terminate();
  } catch (error) {
    console.warn("释放本地 OCR Worker 时发生错误", error);
  }
}

export function isLocalOcrRunning(): boolean {
  return recognitionInProgress;
}
