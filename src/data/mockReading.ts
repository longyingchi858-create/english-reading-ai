import type { ReadingResult } from "@/types/reading";

export const mockReadingResult: ReadingResult = {
  id: "reading-demo-001",

  article: {
    title: "Food Health and Dietary Controversies",
    paragraphs: [
      {
        id: "p1",
        original:
          "Food health scares and dietary controversies continue to erupt in the news. Several studies now suggest that saturated fat may not harm the heart as much as previously believed.",
        translation:
          "关于食品健康的恐慌和饮食争议不断出现在新闻中。多项研究表明，饱和脂肪对心脏的危害可能没有过去认为的那么大。",
      },
      {
        id: "p2",
        original:
          "The other review, a meta-analysis by researchers at Canadian universities, concluded that people eating more saturated fat were no more likely to suffer heart disease.",
        translation:
          "另一项由加拿大大学研究人员开展的荟萃分析认为，摄入更多饱和脂肪的人患心脏病的可能性并不会更高。",
      },
      {
        id: "p3",
        original:
          "This is a small benefit for a tax that hits poor people hardest and could lead people to making other unhealthy choices in their weekly shop instead.",
        translation:
          "这项税收带来的收益很小，却对贫困人群影响最大，还可能促使人们在每周购物时转而选择其他不健康的商品。",
      },
      {
        id: "p4",
        original:
          "The latest example is in New York City, which already requires calorie labels in restaurant chains.",
        translation:
          "最新案例来自纽约市，该市已经要求连锁餐厅标注食物的热量信息。",
      },
    ],
  },

  summary: {
    totalQuestions: 4,
    correctCount: 3,
    accuracy: 75,
    primaryErrorTag: "审题方向反转",
    gradedQuestions: 4,
    aiInferredCount: 0,
  },

  questions: [
    {
      id: "q1",
      number: 1,
      type: "细节理解题",
      answerSource: "user_provided",
      answerConfidence: 1,
      gradingStatus: "officially_graded",
      isCorrect: true,
      answerConflict: false,
      stem: "What do recent studies suggest about saturated fat?",
      stemTranslation: "近期研究对饱和脂肪提出了什么看法？",
      correctAnswer: "B",
      userAnswer: "B",

      options: [
        {
          key: "A",
          original: "It is more harmful than people previously believed.",
          translation: "它比人们过去认为的危害更大。",
          analysis: "原文表达的是危害可能没有过去认为的那么大，选项方向相反。",
        },
        {
          key: "B",
          original:
            "It may be less harmful to the heart than previously believed.",
          translation: "它对心脏的危害可能比过去认为的更小。",
          analysis: "该选项准确复述了第一段中 recent studies 的研究结论。",
        },
        {
          key: "C",
          original: "It has no relationship with human health.",
          translation: "它与人体健康完全没有关系。",
          analysis: "原文只是弱化其危害程度，并没有否认它与健康之间的关系。",
        },
        {
          key: "D",
          original: "It should be completely removed from people’s diets.",
          translation: "人们应当从饮食中彻底去除饱和脂肪。",
          analysis: "原文没有提出彻底停止摄入饱和脂肪的建议。",
        },
      ],

      evidence: {
        paragraphId: "p1",
        quote:
          "Several studies now suggest that saturated fat may not harm the heart as much as previously believed.",
        translation:
          "多项研究表明，饱和脂肪对心脏的危害可能没有过去认为的那么大。",
      },

      errorTags: [],
      reviewAnalysis: "你准确识别了研究结论中的程度变化，答案正确。",
    },

    {
      id: "q2",
      number: 2,
      type: "细节理解题",
      answerSource: "user_provided",
      answerConfidence: 1,
      gradingStatus: "officially_graded",
      isCorrect: true,
      answerConflict: false,
      stem: "What did the Canadian meta-analysis conclude?",
      stemTranslation: "加拿大研究人员开展的荟萃分析得出了什么结论？",
      correctAnswer: "A",
      userAnswer: "A",

      options: [
        {
          key: "A",
          original:
            "Eating more saturated fat did not increase the likelihood of heart disease.",
          translation: "摄入更多饱和脂肪并不会提高患心脏病的可能性。",
          analysis:
            "该选项与第二段结论 no more likely to suffer heart disease 一致。",
        },
        {
          key: "B",
          original: "Saturated fat was proven to prevent heart disease.",
          translation: "研究证明饱和脂肪能够预防心脏病。",
          analysis: "原文只说患病可能性没有更高，并未说明饱和脂肪可以预防疾病。",
        },
        {
          key: "C",
          original: "Only Canadian people can safely consume saturated fat.",
          translation: "只有加拿大人可以安全摄入饱和脂肪。",
          analysis:
            "Canadian 修饰的是研究人员所在的大学，不是研究结论适用的人群。",
        },
        {
          key: "D",
          original:
            "People should consume as much saturated fat as possible.",
          translation: "人们应当尽可能多地摄入饱和脂肪。",
          analysis: "原文没有提出增加饱和脂肪摄入量的建议。",
        },
      ],

      evidence: {
        paragraphId: "p2",
        quote:
          "people eating more saturated fat were no more likely to suffer heart disease",
        translation:
          "摄入更多饱和脂肪的人患心脏病的可能性并不会更高。",
      },

      errorTags: [],
      reviewAnalysis: "你正确理解了 no more likely 的含义，答案正确。",
    },

    {
      id: "q3",
      number: 3,
      type: "细节理解题",
      answerSource: "user_provided",
      answerConfidence: 1,
      gradingStatus: "officially_graded",
      isCorrect: true,
      answerConflict: false,
      stem: "Which one is the weakness of the tax on sugar-sweetened beverages?",
      stemTranslation: "对含糖饮料征税的弱点是什么？",
      correctAnswer: "A",
      userAnswer: "C",

      options: [
        {
          key: "A",
          original:
            "People may make other unhealthy choices which are cheaper.",
          translation: "人们可能转而选择其他价格更低但同样不健康的商品。",
          analysis: "原文指出，糖税可能导致人们转而做出其他不健康的消费选择。",
        },
        {
          key: "B",
          original: "People consume less sugar-sweetened beverages.",
          translation: "人们会减少含糖饮料的消费。",
          analysis: "这是征税后的预期效果，不属于政策弱点。",
        },
        {
          key: "C",
          original: "The possibility of obesity decreases.",
          translation: "肥胖发生的可能性会降低。",
          analysis: "肥胖率下降是糖税的正面效果，但题目询问的是“弱点”。",
        },
        {
          key: "D",
          original: "It limits the amount of sugar consumed by citizens.",
          translation: "它限制了市民的糖摄入量。",
          analysis: "限制糖摄入是政策目标，同样不是糖税的弱点。",
        },
      ],

      evidence: {
        paragraphId: "p3",
        quote:
          "could lead people to making other unhealthy choices in their weekly shop instead",
        translation:
          "还可能促使人们在每周购物时转而选择其他不健康的商品。",
      },

      errorTags: ["审题方向反转"],
      reviewAnalysis:
        "题目询问的是糖税的“弱点”，你选择的是肥胖率下降这一正面效果，出现了审题方向反转。",
    },

    {
      id: "q4",
      number: 4,
      type: "细节理解题",
      answerSource: "user_provided",
      answerConfidence: 1,
      gradingStatus: "officially_graded",
      isCorrect: true,
      answerConflict: false,
      stem:
        "What does New York City already require restaurant chains to do?",
      stemTranslation: "纽约市已经要求连锁餐厅做什么？",
      correctAnswer: "D",
      userAnswer: "D",

      options: [
        {
          key: "A",
          original: "Stop selling food containing saturated fat.",
          translation: "停止销售含有饱和脂肪的食品。",
          analysis: "原文没有提到禁止销售含饱和脂肪的食品。",
        },
        {
          key: "B",
          original: "Reduce the price of healthy meals.",
          translation: "降低健康餐食的价格。",
          analysis: "原文没有讨论餐食价格调整。",
        },
        {
          key: "C",
          original: "Pay an additional tax on every meal.",
          translation: "对每一份餐食缴纳额外税款。",
          analysis: "原文没有说明纽约市要求连锁餐厅对每份餐食缴税。",
        },
        {
          key: "D",
          original: "Display calorie information on their menus.",
          translation: "在菜单上标注食物的热量信息。",
          analysis:
            "该选项对应原文 requires calorie labels in restaurant chains。",
        },
      ],

      evidence: {
        paragraphId: "p4",
        quote:
          "New York City, which already requires calorie labels in restaurant chains",
        translation: "纽约市已经要求连锁餐厅标注食物的热量信息。",
      },

      errorTags: [],
      reviewAnalysis: "你准确定位了纽约市的具体规定，答案正确。",
    },
  ],
};
