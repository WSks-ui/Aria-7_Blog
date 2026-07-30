import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toDateKey } from "../scripts/core/time";
import {
  buildHeatmapModel,
  isSnapshotStale,
  parseSnapshot,
  snapshotToCounts,
  type ContributionSnapshot,
  type HeatmapModel,
} from "./contributionHeatmap";

export interface ContributionSnapshotState {
  snapshot: ContributionSnapshot;
  model: HeatmapModel;
  generatedAt: string;
  stale: boolean;
}

export const DEFAULT_CONTRIBUTION_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/github-contributions.json",
);

/**
 * 贡献快照由归档页和首页共同消费。缺少文件表示尚未抓取过数据，可以降级；
 * 文件存在但结构损坏则必须中止构建，避免把错误统计静默发布到多个页面。
 */
export const parseContributionSnapshotState = (
  raw: unknown,
  buildTime: Date,
): ContributionSnapshotState => {
  const snapshot = parseSnapshot(raw);
  if (!snapshot) {
    throw new Error(
      "[heatmap] src/data/github-contributions.json 未通过校验，请运行 npm run fetch:contributions 重新生成",
    );
  }

  return {
    snapshot,
    model: buildHeatmapModel(snapshotToCounts(snapshot), toDateKey(buildTime)),
    generatedAt: snapshot.generatedAt,
    stale: isSnapshotStale(snapshot.generatedAt, buildTime),
  };
};

export const loadContributionSnapshotState = async (
  buildTime: Date,
  snapshotPath = DEFAULT_CONTRIBUTION_SNAPSHOT_PATH,
): Promise<ContributionSnapshotState | null> => {
  const rawSnapshot = await readFile(snapshotPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (rawSnapshot === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(rawSnapshot) as unknown;
  } catch {
    throw new Error(
      "[heatmap] src/data/github-contributions.json 不是有效 JSON，请运行 npm run fetch:contributions 重新生成",
    );
  }
  return parseContributionSnapshotState(raw, buildTime);
};
