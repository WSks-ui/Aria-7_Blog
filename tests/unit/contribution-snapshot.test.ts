import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  loadContributionSnapshotState,
  parseContributionSnapshotState,
} from "../../src/utils/contributionSnapshot";
import { levelForCount } from "../../src/utils/contributionHeatmap";

const dateKey = (offset: number) => {
  const date = new Date(Date.UTC(2025, 0, 1) + offset * 86_400_000);
  return date.toISOString().slice(0, 10);
};

const createSnapshot = () => {
  const days = Array.from({ length: 367 }, (_, index) => {
    const count = index % 7 === 0 ? 2 : 0;
    return { date: dateKey(index), count, level: levelForCount(count) };
  });
  return {
    generatedAt: "2026-01-02T00:00:00.000Z",
    source: "test",
    login: "WSks-ui",
    total: days.reduce((sum, day) => sum + day.count, 0),
    range: { from: days[0].date, to: days.at(-1)!.date },
    days,
  };
};

describe("共享贡献快照加载", () => {
  it("生成首页和归档页共用的模型与过期状态", () => {
    const state = parseContributionSnapshotState(createSnapshot(), new Date("2026-01-10T00:00:00.000Z"));
    expect(state.model.total).toBeGreaterThan(0);
    expect(state.model.activeDays).toBeGreaterThan(0);
    expect(state.generatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(state.stale).toBe(true);
  });

  it("快照损坏时中止构建而不是伪造零值", () => {
    expect(() => parseContributionSnapshotState({ days: [] }, new Date())).toThrow("未通过校验");
  });

  it("快照文件缺失时允许页面降级", async () => {
    const missing = join(tmpdir(), `aria-missing-contributions-${Date.now()}.json`);
    await expect(loadContributionSnapshotState(new Date(), missing)).resolves.toBeNull();
  });

  it("快照文件不是合法 JSON 时阻止构建", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aria-broken-contributions-"));
    const snapshotPath = join(directory, "snapshot.json");
    try {
      await writeFile(snapshotPath, "{ broken", "utf8");
      await expect(loadContributionSnapshotState(new Date(), snapshotPath)).rejects.toThrow("不是有效 JSON");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
