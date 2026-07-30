export interface HomeDataSummary {
  posts: number;
  words: number;
  categories: number;
  tags: number;
  contributions: number | null;
  activeDays: number | null;
  contributionGeneratedAt: string | null;
  contributionStale: boolean;
  projects: number;
  languages: number;
}
