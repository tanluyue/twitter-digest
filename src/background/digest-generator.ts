import type { ChirpConfig, ScoredTweet, DailyDigest, DigestContent } from '../types/models';
import { getTodayKey } from '../shared/constants';
import { scoreTweet, type DayStats } from '../shared/scoring';
import { getInteractionsByDate, getTweetsByUrls, saveDigest } from '../db/index';
import { callDoubao } from './doubao-client';

const SYSTEM_PROMPT = `你是用户的朋友，晚上一起复盘今天看到的内容。你不是助手，不是分析师，是一起刷推的朋友。

你的任务：把今天读过的推文串成有意思的线索，像朋友聊天那样说出你的真实想法。

Output ONLY valid JSON matching this schema:
{
  "summary": "用一句话说今天刷推的感觉，像跟朋友说'今天刷到好多XX相关的'",
  "topics": [
    {
      "name": "话题名（简短有趣）",
      "topicSummary": "不要列举推文说了什么！要说：这几条放一起你看出了什么？有什么反直觉的？你怎么看？像朋友聊天那样说 2-3 句",
      "tweets": [
        { "tweetUrl": "...", "authorHandle": "@...", "snippet": "这条推文最值得记住的那个点（不是摘要，是你觉得最有信息量的那句话或那个观点）", "score": 85 }
      ]
    }
  ],
  "insights": ["跨话题的联想和洞察——不是'XX值得关注'，而是'你有没有发现A和B其实在说同一件事？'这种"],
  "trends": ["你从今天的阅读里看到的信号——不是'AI很热门'这种废话，而是具体的、可操作的判断"]
}

要求：
- **每一条推文都必须出现在某个 topic 的 tweets 数组里，不能遗漏任何一条！** 这是最重要的规则
- 如果某条推文跟别的都不相关，单独建一个 topic 也行，或者放到最接近的 topic 里
- topics 里的 topicSummary 绝对不能只是"XXX讨论了YYY，ZZZ提到了WWW"这种罗列！要有你自己的判断和联想
- insights 要能触发思考，像"你发现没，今天三个不相关的人都在说同一件事……"
- trends 要具体到可以拿来跟朋友讨论的程度
- snippet 不是摘要，是这条推文最值得记住的核心观点
- 全部用中文，口语化，说人话
- 每个 topic 至少关联 2 条推文（除非真的有落单的）

绝对不能：用"值得关注/深思/探讨"、写论文式总结、罗列推文内容、说空话套话、遗漏推文`;

export async function generateDigest(config: ChirpConfig, dateKey?: string): Promise<void> {
  const key = dateKey ?? getTodayKey();
  const interactions = await getInteractionsByDate(key);

  if (interactions.length === 0) return;

  const tweetUrls = interactions.map(i => i.tweetUrl);
  const tweetsMap = await getTweetsByUrls(tweetUrls);

  const maxDwellMs = Math.max(1, ...interactions.map(i => i.dwellTimeMs));
  const stats: DayStats = { maxDwellMs };

  const scored: ScoredTweet[] = interactions
    .filter(i => tweetsMap.has(i.tweetUrl))
    .map(i => ({
      tweet: tweetsMap.get(i.tweetUrl)!,
      interaction: i,
      score: scoreTweet(i, config.scoringWeights, stats),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return;

  const userPrompt = buildUserPrompt(scored, interactions.length);
  const rawResponse = await callDoubao(config, SYSTEM_PROMPT, userPrompt);
  const content = parseDigestResponse(rawResponse);

  await saveDigest({
    dateKey: key,
    generatedAt: Date.now(),
    tweetsObserved: interactions.length,
    tweetsScored: scored.length,
    content,
    rawResponse,
  });
}

function buildUserPrompt(scoredTweets: ScoredTweet[], totalCount: number): string {
  const engaged = scoredTweets.filter(st => st.score > 0);
  const browsed = scoredTweets.filter(st => st.score === 0);

  const engagedLines = engaged.map((st, i) => {
    const signals: string[] = [];
    if (st.interaction.liked) signals.push('赞');
    if (st.interaction.bookmarked) signals.push('藏');
    if (st.interaction.clickedInto) signals.push('点进详情');
    if (st.interaction.dwellTimeMs > 3000) signals.push(`停留${Math.round(st.interaction.dwellTimeMs / 1000)}s`);
    const sig = signals.length > 0 ? ` [${signals.join('·')}]` : '';
    return `${i + 1}. ${st.tweet.authorHandle}: ${st.tweet.text.slice(0, 600)}${sig}\nURL: ${st.tweet.tweetUrl}`;
  });

  const browsedLines = browsed.slice(0, 30).map((st, i) => {
    return `${i + 1}. ${st.tweet.authorHandle}: ${st.tweet.text.slice(0, 300)}\nURL: ${st.tweet.tweetUrl}`;
  });

  let prompt = `今天一共浏览了 ${totalCount} 条推文。\n\n`;
  prompt += `## 有互动的推文（${engaged.length} 条）：\n${engagedLines.join('\n---\n')}\n\n`;
  if (browsedLines.length > 0) {
    prompt += `## 快速浏览过的推文（${browsed.length} 条，展示前 ${browsedLines.length} 条）：\n${browsedLines.join('\n---\n')}\n\n`;
  }
  prompt += `帮我做今天的阅读复盘。要求：上面列出的每一条推文都必须归入某个 topic 并出现在其 tweets 数组中，不能遗漏。共 ${engaged.length + Math.min(browsed.length, 30)} 条，你的输出里 tweets 总数也应该是这个数。重点分析有互动的推文，快速浏览的作为补充背景。`;
  return prompt;
}

function parseDigestResponse(raw: string): DigestContent {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]) as DigestContent;
  } catch {
    return {
      summary: 'Failed to parse digest. Check raw response.',
      topics: [],
      insights: [],
      trends: [],
    };
  }
}
