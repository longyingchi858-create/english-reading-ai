import { NextResponse } from "next/server";

import type { DifyWorkflowOutput } from "@/lib/transformReadingResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AnalyzeRequestBody = {
  rawText: string;
  userAnswers?: string;
  answerKey?: string;
  userId?: string;
};

type RawDifyOutputs = {
  material_json?: string;
  analysis_json?: string;
  quality_score?: number;
  validation_error?: string;
  repaired_material_json?: string;
  repaired_analysis_json?: string;
  repaired_quality_score?: number;
  repaired_validation_error?: string;
  structure_error?: string;
  repair_error?: string;
  error?: string;
};

type DifyBlockingResponse = {
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    status?: string;
    outputs?: RawDifyOutputs;
    error?: string | null;
  };
};

type DifyStreamEvent = {
  event?: string;
  task_id?: string;
  workflow_run_id?: string;
  message_id?: string;
  code?: string;
  message?: string;
  data?: {
    id?: string;
    status?: string;
    outputs?: RawDifyOutputs;
    error?: string | null;
    title?: string;
    node_type?: string;
  };
};

type DifyErrorResponse = {
  code?: string;
  message?: string;
  status?: number;
  params?: unknown;
};

type FriendlyDifyError = {
  error: string;
  details?: string;
};

const DIFY_TIMEOUT_MS = 8 * 60 * 1000;

function cleanAnswerSequence(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-D]/g, "");
}

function formatDifyError(
  status: number,
  responseText: string,
  contentType = "",
): FriendlyDifyError {
  const trimmedText = responseText.trim();
  const looksLikeHtml =
    contentType.includes("text/html") ||
    /^<!DOCTYPE html/i.test(trimmedText) ||
    /^<html/i.test(trimmedText);

  if ([502, 503, 504].includes(status)) {
    return {
      error:
        `Dify 服务暂时超时或不可用（${status}）。` +
        "长材料请稍后重新提交；如果连续出现，请检查 Dify 工作流中耗时最长的 LLM 节点。",
    };
  }

  if (looksLikeHtml) {
    return {
      error:
        `Dify 请求失败（${status}）。` +
        "上游服务返回了网页错误页，请稍后重试。",
    };
  }

  try {
    const parsed = JSON.parse(
      trimmedText,
    ) as DifyErrorResponse;

    const code = parsed.code?.trim();
    const message = parsed.message?.trim();

    const parts = [
      `Dify 请求失败（${status}）`,
      code ? `错误代码：${code}` : "",
      message ? `原因：${message}` : "",
    ].filter(Boolean);

    return {
      error: parts.join("；"),
      details: JSON.stringify(parsed, null, 2),
    };
  } catch {
    return {
      error:
        `Dify 请求失败（${status}）：` +
        (trimmedText
          ? trimmedText.slice(0, 500)
          : "未返回错误详情"),
    };
  }
}

function normalizeWorkflowOutputs(
  outputs: RawDifyOutputs,
): DifyWorkflowOutput {
  const workflowError =
    outputs.error?.trim() ?? "";

  const structureError =
    outputs.structure_error?.trim() ?? "";

  const repairError =
    outputs.repair_error?.trim() ?? "";

  if (workflowError) {
    throw new Error(
      `Dify 工作流返回错误：${workflowError}`,
    );
  }

  if (structureError) {
    throw new Error(
      `材料结构校验失败：${structureError}`,
    );
  }

  if (repairError) {
    throw new Error(
      `自动修复仍未通过：${repairError}`,
    );
  }

  if (
    outputs.material_json?.trim() &&
    outputs.analysis_json?.trim()
  ) {
    return {
      material_json:
        outputs.material_json,
      analysis_json:
        outputs.analysis_json,
      quality_score:
        outputs.quality_score,
      validation_error:
        outputs.validation_error ?? "",
    };
  }

  if (
    outputs.repaired_material_json?.trim() &&
    outputs.repaired_analysis_json?.trim()
  ) {
    return {
      material_json:
        outputs.repaired_material_json,
      analysis_json:
        outputs.repaired_analysis_json,
      quality_score:
        outputs.repaired_quality_score,
      validation_error:
        outputs.repaired_validation_error ??
        "",
    };
  }

  throw new Error(
    "Dify 最终输出字段不完整。当前返回字段：" +
      Object.keys(outputs).join(", "),
  );
}

function parseSseDataBlock(
  block: string,
): DifyStreamEvent | null {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) =>
      line.slice("data:".length).trimStart(),
    );

  if (dataLines.length === 0) {
    return null;
  }

  const dataText = dataLines.join("\n").trim();

  if (!dataText || dataText === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(dataText) as DifyStreamEvent;
  } catch (error) {
    console.warn("无法解析 Dify SSE 数据块", {
      dataText: dataText.slice(0, 1000),
      error,
    });

    return null;
  }
}

function getStreamEventError(
  event: DifyStreamEvent,
): string {
  return (
    event.data?.error?.trim() ||
    event.message?.trim() ||
    event.code?.trim() ||
    "Dify 流式工作流执行失败。"
  );
}

async function readDifyEventStream(
  response: Response,
): Promise<RawDifyOutputs> {
  if (!response.body) {
    throw new Error(
      "Dify 流式响应没有可读取的响应体。",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let finishedOutputs: RawDifyOutputs | null =
    null;
  let workflowError = "";
  let receivedFinishedEvent = false;

  const handleBlock = (block: string) => {
    const event = parseSseDataBlock(block);

    if (!event) {
      return;
    }

    switch (event.event) {
      case "workflow_finished": {
        receivedFinishedEvent = true;

        if (
          event.data?.status &&
          event.data.status !== "succeeded"
        ) {
          workflowError =
            getStreamEventError(event);
          return;
        }

        if (event.data?.outputs) {
          finishedOutputs = event.data.outputs;
        } else {
          workflowError =
            "Dify 工作流已结束，但没有返回 outputs。";
        }

        return;
      }

      case "workflow_paused": {
        workflowError =
          "Dify 工作流进入了暂停状态，当前页面暂不支持人工输入节点。";
        return;
      }

      case "error": {
        workflowError =
          getStreamEventError(event);
        return;
      }

      default:
        return;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(value, {
          stream: true,
        });
      }

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        handleBlock(block);
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim()) {
      handleBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (workflowError) {
    throw new Error(workflowError);
  }

  if (!receivedFinishedEvent) {
    throw new Error(
      "Dify 流式连接已经结束，但没有收到 workflow_finished 事件。",
    );
  }

  if (!finishedOutputs) {
    throw new Error(
      "Dify 工作流没有返回最终 outputs。",
    );
  }

  return finishedOutputs;
}

async function readUnexpectedSuccessResponse(
  response: Response,
): Promise<RawDifyOutputs> {
  const responseText = await response.text();

  let parsed: DifyBlockingResponse;

  try {
    parsed = JSON.parse(
      responseText,
    ) as DifyBlockingResponse;
  } catch {
    throw new Error(
      "Dify 返回的内容既不是 SSE 流，也不是合法 JSON。",
    );
  }

  if (parsed.data?.status !== "succeeded") {
    throw new Error(
      parsed.data?.error ||
        `Dify 工作流未成功完成，状态：${
          parsed.data?.status ?? "unknown"
        }`,
    );
  }

  if (!parsed.data.outputs) {
    throw new Error(
      "Dify 工作流没有返回 outputs。",
    );
  }

  return parsed.data.outputs;
}

function normalizeDifyApiBaseUrl(
  rawValue: string | undefined,
): string {
  const fallback =
    "https://api.dify.ai/v1";

  const value = (
    rawValue?.trim() || fallback
  )
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/workflows\/run$/i, "")
    .replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      "DIFY_API_BASE_URL 必须以 http:// 或 https:// 开头。",
    );
  }

  return value;
}

function maskApiKey(
  apiKey: string,
): string {
  const trimmed = apiKey.trim();

  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 4)}***`;
  }

  return (
    `${trimmed.slice(0, 7)}...` +
    `${trimmed.slice(-4)}`
  );
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DIFY_TIMEOUT_MS);

  try {
    const body =
      (await request.json()) as Partial<AnalyzeRequestBody>;

    const rawText = body.rawText?.trim();
    const userAnswers = cleanAnswerSequence(
      body.userAnswers ?? "",
    );
    const answerKey = cleanAnswerSequence(
      body.answerKey ?? "",
    );

    if (!rawText) {
      return NextResponse.json(
        {
          error:
            "请输入英语文章、题目和选项。",
        },
        { status: 400 },
      );
    }

    if (
      userAnswers &&
      answerKey &&
      userAnswers.length !== answerKey.length
    ) {
      return NextResponse.json(
        {
          error:
            "你的答案数量与正确答案数量不一致。",
        },
        { status: 400 },
      );
    }

    const rawApiKey =
      process.env.DIFY_API_KEY;

    if (!rawApiKey?.trim()) {
      return NextResponse.json(
        {
          error:
            "服务器缺少 DIFY_API_KEY。请检查项目根目录的 .env.local，然后重启 npm run dev。",
        },
        { status: 500 },
      );
    }

    const apiKey = rawApiKey.trim();

    let apiBaseUrl: string;

    try {
      apiBaseUrl =
        normalizeDifyApiBaseUrl(
          process.env.DIFY_API_BASE_URL,
        );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Dify API 地址无效。";

      return NextResponse.json(
        { error: message },
        { status: 500 },
      );
    }

    const difyUrl =
      `${apiBaseUrl}/workflows/run`;

    console.info("[Dify request config]", {
      baseUrl: apiBaseUrl,
      endpoint: difyUrl,
      apiKey: maskApiKey(apiKey),
      apiKeyLength: apiKey.length,
      inputKeys: [
        "raw_text",
        "user_answers",
        "answer_key",
      ],
    });

    const difyRequestBody = {
      inputs: {
        raw_text: rawText,
        user_answers: userAnswers,
        answer_key: answerKey,
      },
      response_mode: "streaming",
      user:
        body.userId?.trim() ||
        "readmate-local-user",
    };

    const response = await fetch(difyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(difyRequestBody),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText =
        await response.text();

      const formattedError = formatDifyError(
        response.status,
        responseText,
        response.headers.get("content-type") ?? "",
      );

      console.error("Dify API request failed", {
        url: difyUrl,
        status: response.status,
        response:
          responseText.slice(0, 2000),
        sentInputKeys:
          Object.keys(difyRequestBody.inputs),
      });

      return NextResponse.json(
        {
          ...formattedError,
          details: [
            formattedError.details,
            `请求地址：${difyUrl}`,
            `API Key：${maskApiKey(apiKey)}`,
            responseText.trim()
              ? `Dify原始响应：${responseText
                  .trim()
                  .slice(0, 1000)}`
              : "Dify原始响应：空",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        { status: 502 },
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "";

    let rawOutputs: RawDifyOutputs;

    try {
      rawOutputs =
        contentType.includes(
          "text/event-stream",
        )
          ? await readDifyEventStream(response)
          : await readUnexpectedSuccessResponse(
              response,
            );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "读取 Dify 流式响应失败。";

      console.error(
        "Dify streaming response failed",
        error,
      );

      return NextResponse.json(
        { error: message },
        { status: 502 },
      );
    }

    console.info(
      "Dify canonical output keys",
      Object.keys(rawOutputs),
    );

    let normalizedOutputs: DifyWorkflowOutput;

    try {
      normalizedOutputs =
        normalizeWorkflowOutputs(rawOutputs);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Dify 最终输出异常。";

      return NextResponse.json(
        {
          error: message,
          details: JSON.stringify(
            rawOutputs,
            null,
            2,
          ),
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      normalizedOutputs,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return NextResponse.json(
        {
          error:
            "Dify 工作流运行超过8分钟，服务器已停止等待。请缩短材料或优化工作流后重试。",
        },
        { status: 504 },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "服务器发生未知错误。";

    console.error("Analyze API error", error);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

