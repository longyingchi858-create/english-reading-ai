import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReviewReasoningRequest = {
  questionStem: string;
  options: string;
  correctAnswer: string;
  userAnswer: string;
  evidenceQuote: string;
  optionAnalysis: string;
  userReasoning: string;
  userId?: string;
};

type ReasoningVerdict =
  | "correct_but_answer_mistake"
  | "partially_correct"
  | "incorrect"
  | "insufficient_information";

type ErrorTag =
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
  error_tag: ErrorTag;
  correct_reasoning: string[];
  correction: string;
};

type DifyReasoningOutputs = {
  result_json?: string | ReasoningReviewResult;
};

type DifyReasoningResponse = {
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    status?: string;
    outputs?: DifyReasoningOutputs;
    error?: string | null;
  };
};

type DifyErrorResponse = {
  code?: string;
  message?: string;
  status?: number;
};

const ALLOWED_VERDICTS = new Set<ReasoningVerdict>([
  "correct_but_answer_mistake",
  "partially_correct",
  "incorrect",
  "insufficient_information",
]);

const ALLOWED_ERROR_TAGS = new Set<ErrorTag>([
  "detail_mislocation",
  "question_focus_reversal",
  "scope_expansion",
  "causal_reversal",
  "inference_overreach",
  "vocabulary_misread",
  "option_interference",
  "logic_break",
  "unknown",
]);

function formatDifyError(
  status: number,
  responseText: string,
): string {
  try {
    const parsed = JSON.parse(responseText) as DifyErrorResponse;

    const code = parsed.code?.trim();
    const message = parsed.message?.trim();

    return [
      `Dify 错题思路诊断请求失败（${status}）`,
      code ? `错误代码：${code}` : "",
      message ? `原因：${message}` : "",
    ]
      .filter(Boolean)
      .join("；");
  } catch {
    return `Dify 错题思路诊断请求失败（${status}）：${
      responseText || "未返回错误详情"
    }`;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseReasoningResult(
  output: string | ReasoningReviewResult,
): ReasoningReviewResult {
  let parsed: unknown = output;

  if (typeof output === "string") {
    const cleaned = output
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      throw new Error(
        "Dify 返回的 result_json 不是合法 JSON。",
      );
    }
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("错题思路诊断结果必须是 JSON 对象。");
  }

  const data = parsed as Partial<ReasoningReviewResult>;

  if (!isNonEmptyString(data.reasoning_verdict)) {
    throw new Error(
      "错题思路诊断结果缺少 reasoning_verdict。",
    );
  }

  if (
    !ALLOWED_VERDICTS.has(
      data.reasoning_verdict as ReasoningVerdict,
    )
  ) {
    throw new Error(
      `reasoning_verdict 不合法：${data.reasoning_verdict}`,
    );
  }

  if (!isNonEmptyString(data.reasoning_summary)) {
    throw new Error(
      "错题思路诊断结果缺少 reasoning_summary。",
    );
  }

  if (typeof data.correct_part !== "string") {
    throw new Error(
      "错题思路诊断结果中的 correct_part 格式错误。",
    );
  }

  if (!isNonEmptyString(data.key_error)) {
    throw new Error(
      "错题思路诊断结果缺少 key_error。",
    );
  }

  if (!isNonEmptyString(data.error_tag)) {
    throw new Error(
      "错题思路诊断结果缺少 error_tag。",
    );
  }

  if (
    !ALLOWED_ERROR_TAGS.has(data.error_tag as ErrorTag)
  ) {
    throw new Error(
      `error_tag 不合法：${data.error_tag}`,
    );
  }

  if (
    !Array.isArray(data.correct_reasoning) ||
    data.correct_reasoning.length < 2 ||
    data.correct_reasoning.length > 4
  ) {
    throw new Error(
      "correct_reasoning 必须包含 2 至 4 个步骤。",
    );
  }

  const correctReasoning = data.correct_reasoning.map(
    (step, index) => {
      if (!isNonEmptyString(step)) {
        throw new Error(
          `correct_reasoning 第 ${index + 1} 步不能为空。`,
        );
      }

      return step.trim();
    },
  );

  if (!isNonEmptyString(data.correction)) {
    throw new Error(
      "错题思路诊断结果缺少 correction。",
    );
  }

  return {
    reasoning_verdict:
      data.reasoning_verdict as ReasoningVerdict,
    reasoning_summary: data.reasoning_summary.trim(),
    correct_part: data.correct_part.trim(),
    key_error: data.key_error.trim(),
    error_tag: data.error_tag as ErrorTag,
    correct_reasoning: correctReasoning,
    correction: data.correction.trim(),
  };
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Partial<ReviewReasoningRequest>;

    const questionStem = body.questionStem?.trim();
    const options = body.options?.trim();
    const correctAnswer = body.correctAnswer
      ?.trim()
      .toUpperCase();
    const userAnswer = body.userAnswer
      ?.trim()
      .toUpperCase();
    const evidenceQuote = body.evidenceQuote?.trim();
    const optionAnalysis = body.optionAnalysis?.trim();
    const userReasoning = body.userReasoning?.trim();

    if (!questionStem) {
      return NextResponse.json(
        { error: "没有收到题干。" },
        { status: 400 },
      );
    }

    if (!options) {
      return NextResponse.json(
        { error: "没有收到题目选项。" },
        { status: 400 },
      );
    }

    if (!correctAnswer) {
      return NextResponse.json(
        { error: "没有收到正确答案。" },
        { status: 400 },
      );
    }

    if (!userAnswer) {
      return NextResponse.json(
        { error: "没有收到用户答案。" },
        { status: 400 },
      );
    }

    if (!/^[A-D]$/.test(correctAnswer)) {
      return NextResponse.json(
        { error: "正确答案必须是 A、B、C 或 D。" },
        { status: 400 },
      );
    }

    if (!/^[A-D]$/.test(userAnswer)) {
      return NextResponse.json(
        { error: "用户答案必须是 A、B、C 或 D。" },
        { status: 400 },
      );
    }

    if (!evidenceQuote) {
      return NextResponse.json(
        { error: "没有收到原文证据。" },
        { status: 400 },
      );
    }

    if (!optionAnalysis) {
      return NextResponse.json(
        { error: "没有收到选项解析。" },
        { status: 400 },
      );
    }

    if (!userReasoning) {
      return NextResponse.json(
        { error: "请先填写你的做题思路。" },
        { status: 400 },
      );
    }

    if (questionStem.length > 3000) {
      return NextResponse.json(
        { error: "题干过长，请缩短后重试。" },
        { status: 400 },
      );
    }

    if (options.length > 8000) {
      return NextResponse.json(
        { error: "题目选项内容过长，请缩短后重试。" },
        { status: 400 },
      );
    }

    if (evidenceQuote.length > 8000) {
      return NextResponse.json(
        { error: "原文证据过长，请缩短后重试。" },
        { status: 400 },
      );
    }

    if (optionAnalysis.length > 16000) {
      return NextResponse.json(
        { error: "选项解析内容过长，请缩短后重试。" },
        { status: 400 },
      );
    }

    if (userReasoning.length > 6000) {
      return NextResponse.json(
        { error: "做题思路过长，请缩短后重试。" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DIFY_REASONING_API_KEY;
    const apiBaseUrl =
      process.env.DIFY_API_BASE_URL ?? "https://api.dify.ai/v1";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "服务器缺少 DIFY_REASONING_API_KEY。请检查项目根目录的 .env.local，并重启 npm run dev。",
        },
        { status: 500 },
      );
    }

    const difyUrl =
      `${apiBaseUrl.replace(/\/$/, "")}/workflows/run`;

    const response = await fetch(difyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          question_stem: questionStem,
          options,
          correct_answer: correctAnswer,
          user_answer: userAnswer,
          evidence_quote: evidenceQuote,
          option_analysis: optionAnalysis,
          user_reasoning: userReasoning,
        },
        response_mode: "blocking",
        user:
          body.userId?.trim() ||
          "readmate-reasoning-local-user",
      }),
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorMessage = formatDifyError(
        response.status,
        responseText,
      );

      console.error("Dify reasoning review failed", {
        status: response.status,
        response: responseText,
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: 502 },
      );
    }

    let difyResult: DifyReasoningResponse;

    try {
      difyResult = JSON.parse(
        responseText,
      ) as DifyReasoningResponse;
    } catch {
      return NextResponse.json(
        {
          error:
            "Dify 返回了无法解析的错题思路诊断响应。",
          details: responseText,
        },
        { status: 502 },
      );
    }

    if (difyResult.data?.status !== "succeeded") {
      return NextResponse.json(
        {
          error:
            difyResult.data?.error ||
            `错题思路诊断工作流未成功完成，状态：${
              difyResult.data?.status ?? "unknown"
            }`,
        },
        { status: 502 },
      );
    }

    const resultJson =
      difyResult.data.outputs?.result_json;

    if (!resultJson) {
      return NextResponse.json(
        {
          error:
            "错题思路诊断工作流没有返回 result_json 字段。",
          details: JSON.stringify(
            difyResult.data?.outputs ?? {},
            null,
            2,
          ),
        },
        { status: 502 },
      );
    }

    let reasoningResult: ReasoningReviewResult;

    try {
      reasoningResult = parseReasoningResult(resultJson);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "错题思路诊断结果解析失败。";

      return NextResponse.json(
        {
          error: message,
          details:
            typeof resultJson === "string"
              ? resultJson
              : JSON.stringify(resultJson, null, 2),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(reasoningResult);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "错题思路诊断过程中发生未知错误。";

    console.error("Review reasoning API error", error);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
