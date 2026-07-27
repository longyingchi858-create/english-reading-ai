"use client";

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TARGET_LONG_EDGE = 2200;
const DEFAULT_MAX_FILE_SIZE_BYTES =
  10 * 1024 * 1024;

let workerConfigured = false;

export type PdfRenderProgress = {
  progress: number;
  currentPage: number;
  totalPages: number;
  message: string;
};

export type PdfToImagesOptions = {
  maxPages?: number;
  targetLongEdge?: number;
  maxFileSizeBytes?: number;
  signal?: AbortSignal;
  onProgress?: (
    progress: PdfRenderProgress,
  ) => void;
};

export type PdfToImagesResult = {
  files: File[];
  pageCount: number;
  elapsedMs: number;
};

function createAbortError(): Error {
  const error = new Error("PDF OCR 已取消。");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(
  signal?: AbortSignal,
): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isPdfFile(file: File): boolean {
  const extension =
    file.name.split(".").pop()?.toLowerCase() ?? "";

  return (
    extension === "pdf" ||
    file.type.toLowerCase() === "application/pdf"
  );
}

function emitProgress(
  callback:
    | PdfToImagesOptions["onProgress"]
    | undefined,
  progress: PdfRenderProgress,
): void {
  callback?.({
    ...progress,
    progress: Math.min(
      1,
      Math.max(0, progress.progress),
    ),
  });
}

function canvasToPngBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(
          new Error(
            "PDF 页面转换为图片失败。",
          ),
        );
      },
      "image/png",
    );
  });
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

    workerConfigured = true;
  }

  return pdfjs;
}

/**
 * 在浏览器中将扫描版 PDF 的每一页渲染为 PNG，
 * 后续可直接交给 Tesseract.js 识别。
 */
export async function renderPdfToImageFiles(
  file: File,
  options: PdfToImagesOptions = {},
): Promise<PdfToImagesResult> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    throw new Error(
      "PDF 本地转换只能在浏览器中运行。",
    );
  }

  const {
    maxPages = DEFAULT_MAX_PAGES,
    targetLongEdge = DEFAULT_TARGET_LONG_EDGE,
    maxFileSizeBytes =
      DEFAULT_MAX_FILE_SIZE_BYTES,
    signal,
    onProgress,
  } = options;

  if (!isPdfFile(file)) {
    throw new Error(
      "请选择有效的 PDF 文件。",
    );
  }

  if (file.size === 0) {
    throw new Error("PDF 文件为空。");
  }

  if (file.size > maxFileSizeBytes) {
    const maxSizeMb = Math.round(
      maxFileSizeBytes / 1024 / 1024,
    );

    throw new Error(
      `PDF 超过 ${maxSizeMb} MB，请压缩后重试。`,
    );
  }

  throwIfAborted(signal);

  const startedAt = performance.now();

  emitProgress(onProgress, {
    progress: 0.02,
    currentPage: 0,
    totalPages: 0,
    message: "正在读取 PDF……",
  });

  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();

  throwIfAborted(signal);

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
  });

  const pdf = await loadingTask.promise;

  try {
    const totalPages = pdf.numPages;

    if (totalPages <= 0) {
      throw new Error(
        "PDF 中没有可处理的页面。",
      );
    }

    if (totalPages > maxPages) {
      throw new Error(
        `扫描版 PDF 当前最多支持 ${maxPages} 页，这个文件共有 ${totalPages} 页。请拆分后上传。`,
      );
    }

    const files: File[] = [];
    const baseName =
      file.name.replace(/\.pdf$/i, "") ||
      "scanned-pdf";

    for (
      let pageNumber = 1;
      pageNumber <= totalPages;
      pageNumber += 1
    ) {
      throwIfAborted(signal);

      emitProgress(onProgress, {
        progress:
          0.05 +
          ((pageNumber - 1) / totalPages) *
            0.9,
        currentPage: pageNumber,
        totalPages,
        message:
          `正在将 PDF 第 ${pageNumber}/${totalPages} 页转换为图片……`,
      });

      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({
        scale: 1,
      });

      const longEdge = Math.max(
        baseViewport.width,
        baseViewport.height,
      );

      const scale = Math.min(
        3.2,
        Math.max(
          1.5,
          targetLongEdge / longEdge,
        ),
      );

      const viewport = page.getViewport({
        scale,
      });

      const canvas =
        document.createElement("canvas");

      canvas.width = Math.max(
        1,
        Math.floor(viewport.width),
      );

      canvas.height = Math.max(
        1,
        Math.floor(viewport.height),
      );

      const context = canvas.getContext(
        "2d",
        {
          alpha: false,
          willReadFrequently: false,
        },
      );

      if (!context) {
        throw new Error(
          `无法创建第 ${pageNumber} 页的画布。`,
        );
      }

      context.fillStyle = "#ffffff";
      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const blob =
        await canvasToPngBlob(canvas);

      const pageFile = new File(
        [blob],
        `${baseName}-page-${String(
          pageNumber,
        ).padStart(2, "0")}.png`,
        {
          type: "image/png",
          lastModified: Date.now(),
        },
      );

      files.push(pageFile);

      page.cleanup();

      canvas.width = 1;
      canvas.height = 1;
    }

    emitProgress(onProgress, {
      progress: 1,
      currentPage: totalPages,
      totalPages,
      message:
        `PDF 已转换为 ${totalPages} 张图片，准备开始 OCR。`,
    });

    return {
      files,
      pageCount: totalPages,
      elapsedMs: Math.round(
        performance.now() - startedAt,
      ),
    };
  } finally {
      // pdfjs-dist 新版本 PDFDocumentProxy 不再提供 destroy()
  }
}
