import { NextResponse } from "next/server";
import * as mammoth from "mammoth";
import {
  extractText,
  getDocumentProxy,
} from "unpdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_PDF_TEXT_CHARACTERS = 80;

type SupportedFileType =
  | "txt"
  | "docx"
  | "pdf"
  | "image";

type OcrReason =
  | "image"
  | "pdf_no_text"
  | "pdf_low_text"
  | "pdf_partial_text";

type ExtractionResult = {
  text: string;
  fileType: SupportedFileType;
  pageCount?: number;
  warnings: string[];
  requiresOcr: boolean;
  ocrReason?: OcrReason;
};

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

function detectFileType(
  file: File,
): SupportedFileType | null {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();

  if (
    extension === "txt" ||
    mimeType === "text/plain"
  ) {
    return "txt";
  }

  if (
    extension === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }

  if (
    extension === "pdf" ||
    mimeType === "application/pdf"
  ) {
    return "pdf";
  }

  if (
    ["jpg", "jpeg", "png", "webp"].includes(
      extension,
    ) ||
    [
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(mimeType)
  ) {
    return "image";
  }

  return null;
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countVisibleCharacters(text: string): number {
  return text.replace(/\s/g, "").length;
}

function decodeTextFile(
  arrayBuffer: ArrayBuffer,
): string {
  const bytes = new Uint8Array(arrayBuffer);

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(
      bytes.slice(3),
    );
  }

  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xfe
  ) {
    return new TextDecoder("utf-16le").decode(
      bytes.slice(2),
    );
  }

  if (
    bytes.length >= 2 &&
    bytes[0] === 0xfe &&
    bytes[1] === 0xff
  ) {
    return new TextDecoder("utf-16be").decode(
      bytes.slice(2),
    );
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function hasPdfSignature(
  arrayBuffer: ArrayBuffer,
): boolean {
  const bytes = new Uint8Array(
    arrayBuffer,
    0,
    Math.min(arrayBuffer.byteLength, 5),
  );

  const signature = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");

  return signature === "%PDF-";
}

function hasJpegSignature(
  bytes: Uint8Array,
): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function hasPngSignature(
  bytes: Uint8Array,
): boolean {
  const signature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ];

  return (
    bytes.length >= signature.length &&
    signature.every(
      (value, index) => bytes[index] === value,
    )
  );
}

function hasWebpSignature(
  bytes: Uint8Array,
): boolean {
  if (bytes.length < 12) {
    return false;
  }

  const riff = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
  );

  const webp = String.fromCharCode(
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
  );

  return riff === "RIFF" && webp === "WEBP";
}

function validateImageSignature(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): void {
  const bytes = new Uint8Array(
    arrayBuffer,
    0,
    Math.min(arrayBuffer.byteLength, 16),
  );

  const extension = getFileExtension(fileName);

  const isValid =
    (["jpg", "jpeg"].includes(extension) &&
      hasJpegSignature(bytes)) ||
    (extension === "png" &&
      hasPngSignature(bytes)) ||
    (extension === "webp" &&
      hasWebpSignature(bytes));

  if (!isValid) {
    throw new Error(
      "图片扩展名与实际文件内容不一致，或图片文件已损坏。",
    );
  }
}

async function extractTxt(
  arrayBuffer: ArrayBuffer,
): Promise<ExtractionResult> {
  const text = normalizeExtractedText(
    decodeTextFile(arrayBuffer),
  );

  return {
    text,
    fileType: "txt",
    warnings: [],
    requiresOcr: false,
  };
}

async function extractDocx(
  arrayBuffer: ArrayBuffer,
): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(arrayBuffer),
  });

  const text = normalizeExtractedText(result.value);

  const warnings = result.messages
    .filter((message) => message.type === "warning")
    .map((message) => message.message)
    .filter(Boolean);

  return {
    text,
    fileType: "docx",
    warnings,
    requiresOcr: false,
  };
}

async function inspectImage(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<ExtractionResult> {
  validateImageSignature(arrayBuffer, fileName);

  return {
    text: "",
    fileType: "image",
    warnings: [
      "图片文件已识别，下一步需要通过 OCR 提取文字。",
    ],
    requiresOcr: true,
    ocrReason: "image",
  };
}

async function extractPdf(
  arrayBuffer: ArrayBuffer,
): Promise<ExtractionResult> {
  if (!hasPdfSignature(arrayBuffer)) {
    throw new Error(
      "文件扩展名是 PDF，但文件内容不是有效的 PDF。",
    );
  }

  const pdf = await getDocumentProxy(
    new Uint8Array(arrayBuffer),
  );

  try {
    const result = await extractText(pdf);

    const pageTexts = result.text.map((pageText) =>
      normalizeExtractedText(pageText),
    );

    const nonEmptyPages = pageTexts.filter(Boolean);
    const text = nonEmptyPages.join("\n\n");
    const visibleCharacterCount =
      countVisibleCharacters(text);

    const emptyPageCount =
      result.totalPages - nonEmptyPages.length;

    const textCoverage =
      result.totalPages > 0
        ? nonEmptyPages.length / result.totalPages
        : 0;

    const warnings: string[] = [];

    if (emptyPageCount > 0) {
      warnings.push(
        `共 ${result.totalPages} 页，其中 ${emptyPageCount} 页没有提取到可选择文字。`,
      );
    }

    if (!text) {
      return {
        text: "",
        fileType: "pdf",
        pageCount: result.totalPages,
        warnings: [
          ...warnings,
          "这个 PDF 没有可选择文字，可能是扫描版或图片型 PDF。",
        ],
        requiresOcr: true,
        ocrReason: "pdf_no_text",
      };
    }

    if (visibleCharacterCount < MIN_PDF_TEXT_CHARACTERS) {
      return {
        text,
        fileType: "pdf",
        pageCount: result.totalPages,
        warnings: [
          ...warnings,
          "提取到的文字非常少，PDF 可能主要由扫描图片构成，建议使用 OCR。",
        ],
        requiresOcr: true,
        ocrReason: "pdf_low_text",
      };
    }

    if (
      result.totalPages > 1 &&
      textCoverage < 0.6
    ) {
      return {
        text,
        fileType: "pdf",
        pageCount: result.totalPages,
        warnings: [
          ...warnings,
          "只有部分页面提取到可选择文字，其他页面可能需要 OCR。",
        ],
        requiresOcr: true,
        ocrReason: "pdf_partial_text",
      };
    }

    return {
      text,
      fileType: "pdf",
      pageCount: result.totalPages,
      warnings,
      requiresOcr: false,
    };
  } finally {
    await pdf.destroy();
  }
}

async function extractFile(
  file: File,
  fileType: SupportedFileType,
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();

  switch (fileType) {
    case "txt":
      return extractTxt(arrayBuffer);

    case "docx":
      return extractDocx(arrayBuffer);

    case "pdf":
      return extractPdf(arrayBuffer);

    case "image":
      return inspectImage(
        arrayBuffer,
        file.name,
      );

    default: {
      const exhaustiveCheck: never = fileType;

      throw new Error(
        `不支持的文件类型：${String(exhaustiveCheck)}`,
      );
    }
  }
}

function getFileTypeErrorMessage(
  fileType: SupportedFileType,
): string {
  switch (fileType) {
    case "docx":
      return "DOCX 文件解析失败。请确认它是有效的 .docx 文件，而不是旧版 .doc 文件或改后缀文件。";

    case "pdf":
      return "PDF 文件解析失败。文件可能已损坏、加密，或使用了当前解析器不支持的结构。";

    case "image":
      return "图片文件读取失败。请确认图片没有损坏，并使用 JPG、PNG 或 WEBP 格式。";

    case "txt":
      return "TXT 文件读取失败。";

    default:
      return "文件读取失败。";
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploadedValue = formData.get("file");

    if (!(uploadedValue instanceof File)) {
      return NextResponse.json(
        {
          error:
            '没有收到上传文件。请使用字段名 "file" 上传文件。',
        },
        { status: 400 },
      );
    }

    const file = uploadedValue;

    if (!file.name.trim()) {
      return NextResponse.json(
        { error: "上传的文件缺少文件名。" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "上传的文件是空文件。" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error:
            "文件超过 10 MB。请压缩文件后重试。",
          maxSizeBytes: MAX_FILE_SIZE_BYTES,
        },
        { status: 413 },
      );
    }

    const fileType = detectFileType(file);

    if (!fileType) {
      return NextResponse.json(
        {
          error:
            "暂时只支持 TXT、DOCX、PDF、JPG、JPEG、PNG 和 WEBP 文件。旧版 DOC 文件暂不支持。",
          supportedExtensions: [
            ".txt",
            ".docx",
            ".pdf",
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
          ],
        },
        { status: 415 },
      );
    }

    let extractionResult: ExtractionResult;

    try {
      extractionResult = await extractFile(
        file,
        fileType,
      );
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : "文件解析失败。";

      console.error("Extract uploaded file failed", {
        fileName: file.name,
        fileType,
        fileSize: file.size,
        error,
      });

      return NextResponse.json(
        {
          error: getFileTypeErrorMessage(fileType),
          details: rawMessage,
        },
        { status: 422 },
      );
    }

    const text = extractionResult.text;

    if (
      !text &&
      !extractionResult.requiresOcr
    ) {
      return NextResponse.json(
        {
          error:
            "文件中没有提取到可用文字，请检查文件内容。",
          fileName: file.name,
          fileType,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      text,
      fileName: file.name,
      fileType: extractionResult.fileType,
      mimeType: file.type || null,
      sizeBytes: file.size,
      characterCount: text.length,
      pageCount:
        extractionResult.pageCount ?? null,
      warnings: extractionResult.warnings,
      requiresOcr:
        extractionResult.requiresOcr,
      ocrReason:
        extractionResult.ocrReason ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "文件文字提取过程中发生未知错误。";

    console.error("Extract text API error", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
