import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TranslateSentenceRequest = {
  selectedText: string;
  paragraphContext: string;
  userId?: string;
};

type DifySentenceOutputs = {
  translation?: string;
};

type DifySentenceResponse = {
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    status?: string;
    outputs?: DifySentenceOutputs;
    error?: string | null;
  };
};

type DifyErrorResponse = {
  code?: string;
  message?: string;
  status?: number;
};

function formatDifyError(
  status: number,
  responseText: string,
): string {
  try {
    const parsed = JSON.parse(responseText) as DifyErrorResponse;

    const code = parsed.code?.trim();
    const message = parsed.message?.trim();

    return [
      `Dify 句子翻译请求失败（${status}）`,
      code ? `错误代码：${code}` : "",
      message ? `原因：${message}` : "",
    ]
      .filter(Boolean)
      .join("；");
  } catch {
    return `Dify 句子翻译请求失败（${status}）：${
      responseText || "未返回错误详情"
    }`;
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Partial<TranslateSentenceRequest>;

    const selectedText = body.selectedText?.trim();
    const paragraphContext = body.paragraphContext?.trim();

    if (!selectedText) {
      return NextResponse.json(
        { error: "没有收到需要翻译的英文内容。" },
        { status: 400 },
      );
    }

    if (!paragraphContext) {
      return NextResponse.json(
        { error: "没有收到所选内容所在的英文段落。" },
        { status: 400 },
      );
    }

    if (selectedText.length > 3000) {
      return NextResponse.json(
        { error: "所选英文过长，请缩短后重新翻译。" },
        { status: 400 },
      );
    }

    if (paragraphContext.length > 12000) {
      return NextResponse.json(
        { error: "所在段落过长，请缩短后重新翻译。" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DIFY_SENTENCE_API_KEY;
    const apiBaseUrl =
      process.env.DIFY_API_BASE_URL ?? "https://api.dify.ai/v1";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "服务器缺少 DIFY_SENTENCE_API_KEY。请检查项目根目录的 .env.local，并重启 npm run dev。",
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
          selected_text: selectedText,
          paragraph_context: paragraphContext,
        },
        response_mode: "blocking",
        user:
          body.userId?.trim() ||
          "readmate-sentence-local-user",
      }),
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorMessage = formatDifyError(
        response.status,
        responseText,
      );

      console.error("Dify sentence translation failed", {
        status: response.status,
        response: responseText,
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: 502 },
      );
    }

    let difyResult: DifySentenceResponse;

    try {
      difyResult = JSON.parse(
        responseText,
      ) as DifySentenceResponse;
    } catch {
      return NextResponse.json(
        {
          error: "Dify 返回了无法解析的句子翻译响应。",
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
            `句子翻译工作流未成功完成，状态：${
              difyResult.data?.status ?? "unknown"
            }`,
        },
        { status: 502 },
      );
    }

    const translation =
      difyResult.data.outputs?.translation?.trim();

    if (!translation) {
      return NextResponse.json(
        {
          error:
            "句子翻译工作流没有返回 translation 字段。",
          details: JSON.stringify(
            difyResult.data?.outputs ?? {},
            null,
            2,
          ),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      translation,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "句子翻译过程中发生未知错误。";

    console.error("Translate sentence API error", error);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
