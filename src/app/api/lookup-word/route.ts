import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LookupWordRequest = {
  selectedWord: string;
  sentenceContext: string;
  userId?: string;
};

type CommonDefinition = {
  part_of_speech: string;
  meanings: string[];
};

type WordLookupResult = {
  word: string;
  lemma: string;
  phonetic: string;
  common_definitions: CommonDefinition[];
  context_part_of_speech: string;
  context_meaning: string;
  source_sentence: string;
};

type DifyWordOutputs = {
  result_json?: string | WordLookupResult;
};

type DifyWordResponse = {
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    status?: string;
    outputs?: DifyWordOutputs;
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
      `Dify 单词查询请求失败（${status}）`,
      code ? `错误代码：${code}` : "",
      message ? `原因：${message}` : "",
    ]
      .filter(Boolean)
      .join("；");
  } catch {
    return `Dify 单词查询请求失败（${status}）：${
      responseText || "未返回错误详情"
    }`;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseWordResult(
  output: string | WordLookupResult,
): WordLookupResult {
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
    throw new Error("单词查询结果必须是 JSON 对象。");
  }

  const data = parsed as Partial<WordLookupResult>;

  if (!isNonEmptyString(data.word)) {
    throw new Error("单词查询结果缺少 word。");
  }

  if (!isNonEmptyString(data.lemma)) {
    throw new Error("单词查询结果缺少 lemma。");
  }

  if (typeof data.phonetic !== "string") {
    throw new Error("单词查询结果中的 phonetic 格式错误。");
  }

  if (
    !Array.isArray(data.common_definitions) ||
    data.common_definitions.length === 0
  ) {
    throw new Error(
      "单词查询结果缺少 common_definitions。",
    );
  }

  const commonDefinitions = data.common_definitions.map(
    (definition, index) => {
      if (
        !definition ||
        typeof definition !== "object" ||
        Array.isArray(definition)
      ) {
        throw new Error(
          `common_definitions 第 ${index + 1} 项格式错误。`,
        );
      }

      if (!isNonEmptyString(definition.part_of_speech)) {
        throw new Error(
          `common_definitions 第 ${index + 1} 项缺少词性。`,
        );
      }

      if (
        !Array.isArray(definition.meanings) ||
        definition.meanings.length === 0
      ) {
        throw new Error(
          `common_definitions 第 ${index + 1} 项缺少释义。`,
        );
      }

      const meanings = definition.meanings
        .filter(isNonEmptyString)
        .map((meaning) => meaning.trim());

      if (meanings.length === 0) {
        throw new Error(
          `common_definitions 第 ${index + 1} 项没有有效释义。`,
        );
      }

      return {
        part_of_speech: definition.part_of_speech.trim(),
        meanings,
      };
    },
  );

  if (!isNonEmptyString(data.context_part_of_speech)) {
    throw new Error(
      "单词查询结果缺少 context_part_of_speech。",
    );
  }

  if (!isNonEmptyString(data.context_meaning)) {
    throw new Error(
      "单词查询结果缺少 context_meaning。",
    );
  }

  if (!isNonEmptyString(data.source_sentence)) {
    throw new Error(
      "单词查询结果缺少 source_sentence。",
    );
  }

  return {
    word: data.word.trim(),
    lemma: data.lemma.trim(),
    phonetic: data.phonetic.trim(),
    common_definitions: commonDefinitions,
    context_part_of_speech:
      data.context_part_of_speech.trim(),
    context_meaning: data.context_meaning.trim(),
    source_sentence: data.source_sentence.trim(),
  };
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Partial<LookupWordRequest>;

    const selectedWord = body.selectedWord?.trim();
    const sentenceContext = body.sentenceContext?.trim();

    if (!selectedWord) {
      return NextResponse.json(
        { error: "没有收到需要查询的英文单词。" },
        { status: 400 },
      );
    }

    if (!sentenceContext) {
      return NextResponse.json(
        { error: "没有收到该单词所在的英文句子。" },
        { status: 400 },
      );
    }

    if (selectedWord.length > 100) {
      return NextResponse.json(
        { error: "所选内容过长，请只选择一个英文单词。" },
        { status: 400 },
      );
    }

    const wordPattern = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;

    if (!wordPattern.test(selectedWord)) {
      return NextResponse.json(
        {
          error:
            "当前单词查询只支持单个英文单词，请不要选择整句或多个单词。",
        },
        { status: 400 },
      );
    }

    if (sentenceContext.length > 3000) {
      return NextResponse.json(
        { error: "所在句子过长，请缩短后重新查询。" },
        { status: 400 },
      );
    }

    const apiKey = process.env.DIFY_WORD_API_KEY;
    const apiBaseUrl =
      process.env.DIFY_API_BASE_URL ?? "https://api.dify.ai/v1";

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "服务器缺少 DIFY_WORD_API_KEY。请检查项目根目录的 .env.local，并重启 npm run dev。",
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
          selected_word: selectedWord,
          sentence_context: sentenceContext,
        },
        response_mode: "blocking",
        user:
          body.userId?.trim() ||
          "readmate-word-local-user",
      }),
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorMessage = formatDifyError(
        response.status,
        responseText,
      );

      console.error("Dify word lookup failed", {
        status: response.status,
        response: responseText,
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: 502 },
      );
    }

    let difyResult: DifyWordResponse;

    try {
      difyResult = JSON.parse(
        responseText,
      ) as DifyWordResponse;
    } catch {
      return NextResponse.json(
        {
          error: "Dify 返回了无法解析的单词查询响应。",
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
            `单词查询工作流未成功完成，状态：${
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
            "单词查询工作流没有返回 result_json 字段。",
          details: JSON.stringify(
            difyResult.data?.outputs ?? {},
            null,
            2,
          ),
        },
        { status: 502 },
      );
    }

    let wordResult: WordLookupResult;

    try {
      wordResult = parseWordResult(resultJson);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "单词查询结果解析失败。";

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

    return NextResponse.json(wordResult);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "单词查询过程中发生未知错误。";

    console.error("Lookup word API error", error);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
