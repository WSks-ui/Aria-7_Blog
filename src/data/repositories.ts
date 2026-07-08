export interface RepositoryCard {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  updated: string;
  mood: string;
  tags: string[];
}

export const repositories: RepositoryCard[] = [
  {
    name: "Aria-7_Blog",
    url: "https://github.com/WSks-ui/Aria-7_Blog",
    description: "新版 Aria-7th Lab，使用 Astro、原生 JS/CSS 和柔和漫画感视觉重新搭建的个人博客。",
    language: "CSS",
    stars: 0,
    forks: 0,
    updated: "2026-07-02",
    mood: "now building",
    tags: ["Astro", "Vanilla JS", "Blog"],
  },
  {
    name: "aria7-blog",
    url: "https://github.com/WSks-ui/aria7-blog",
    description: "旧版 Firefly 博客二次开发项目，保留了文章、音乐播放器、公告与一批可选择继承的博客功能。",
    language: "Astro",
    stars: 1,
    forks: 0,
    updated: "2026-06-29",
    mood: "legacy base",
    tags: ["Firefly", "Astro", "Theme"],
  },
  {
    name: "2bis",
    url: "https://github.com/WSks-ui/2bis",
    description: "文生图 / 图生图 Web 程序，围绕 GPT-image2 模型做生成流程、额度和平台化功能实验。",
    language: "Python",
    stars: 0,
    forks: 0,
    updated: "2026-06-30",
    mood: "AI lab",
    tags: ["AI", "Web", "Image"],
  },
  {
    name: "interview-wind-tunnel",
    url: "https://github.com/WSks-ui/interview-wind-tunnel",
    description: "面试风洞：用极端面试场景模拟压力环境，测试真实抗压阈值的小型实验项目。",
    language: "Python",
    stars: 1,
    forks: 0,
    updated: "2026-07-01",
    mood: "pressure test",
    tags: ["Python", "AI", "Experiment"],
  },
  {
    name: "EquatorialMmount",
    url: "https://github.com/WSks-ui/EquatorialMmount",
    description: "鸿蒙设备 AR 控制赤道仪案例，把设备控制、空间交互和观测场景放在一起试验。",
    language: "TypeScript",
    stars: 0,
    forks: 0,
    updated: "2026-07-03",
    mood: "hardware spell",
    tags: ["HarmonyOS", "AR", "TypeScript"],
  },
  {
    name: "minimind-o-self",
    url: "https://github.com/WSks-ui/minimind-o-self",
    description: "MiniMind-O 学习副本，用来记录轻薄本本地推理和多模态模型体验过程。",
    language: "Python",
    stars: 1,
    forks: 0,
    updated: "2026-06-03",
    mood: "learning copy",
    tags: ["LLM", "Local AI", "Notes"],
  },
];
