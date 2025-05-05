export const FILTER_CONFIG = {
  filterFields: ["summary", "description"],
  range: {
    start: new Date("2024-01-01T00:00:00Z"),
    end: new Date("2025-12-31T23:59:59Z"),
  },
  filterRules: [
    { summary: "电商研发技术Talk" },
    {
      summary: ["进度同步站立会", "进度同步-站立会"],
      comment: "进度同步站立会-周二周四",
    },
    {
      summary: ["商品前端技术方案 & DogFooding", "商品前端技术方案&CR"],
      comment: "过滤一下商品相关的会",
    },
    { summary: "抖店需求初评会" },
    { summary: "【跳过】" },
    { summary: "大前端技术Topic分享" },
    { summary: "平台＆到家前端技术方案评审" },
    { summary: "假期封禁" },
    { summary: "内容素材技术评审" },
    { summary: "工作台上线review" },
    { summary: "【到家初评会】" },
    { summary: "抖店公共review" },
    { description: "146197933", comment: "素材技术评审会" },
    { summary: "内容素材后端周会" },
  ],
};
