import type { TweetInteraction, ScoringWeights } from '../types/models';

export interface DayStats {
  maxDwellMs: number;
}

export function scoreTweet(
  interaction: TweetInteraction,
  weights: ScoringWeights,
  stats: DayStats
): number {
  const dwellNorm = stats.maxDwellMs > 0
    ? Math.min(1, Math.log1p(interaction.dwellTimeMs) / Math.log1p(stats.maxDwellMs))
    : 0;

  const raw =
    weights.dwellTime * dwellNorm +
    weights.liked * (interaction.liked ? 1 : 0) +
    weights.bookmarked * (interaction.bookmarked ? 1 : 0) +
    weights.clickedInto * (interaction.clickedInto ? 1 : 0) +
    weights.followed * (interaction.followedAuthor ? 1 : 0);

  return Math.round(raw * 100);
}
