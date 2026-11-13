/**
 * 浏览器预览用的演示后端。
 * 只有在非 Tauri 环境（`npm run dev` 直接开浏览器）下启用，
 * 数据写入 localStorage，用于视觉走查与交互验收。
 * 桌面版一律走 Rust 命令，不会加载这里的任何数据。
 */
import type {
  Achievement,
  AppInfo,
  FolderCandidate,
  Game,
  LaunchInfo,
  ModEntry,
  ScanResult,
  Settings,
  SteamSearchItem,
  Tag,
} from "@/types";
import { sortGames } from "@/lib/format";

const TAGS: Tag[] = [
  { id: 1, name: "动作", color: "#e0645a" },
  { id: 2, name: "角色扮演", color: "#a78bfa" },
  { id: 3, name: "独立", color: "#7fd4a2" },
  { id: 4, name: "模拟", color: "#e8b45a" },
];

const tag = (...ids: number[]) => TAGS.filter((t) => ids.includes(t.id));

function daysAgo(days: number, hour = 21, minute = 14): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seedGames(): Game[] {
  const base = {
    exePath: null as string | null,
    workDir: null as string | null,
    args: null as string | null,
    coverPath: null as string | null,
    bannerPath: null as string | null,
    hidden: false,
    screenshots: [] as string[],
    descriptionOriginal: null as string | null,
    publishers: [] as string[],
    categories: [] as string[],
    reviewTotal: null as number | null,
    metacritic: null as number | null,
    modsDir: null as string | null,
    running: false,
    sessionSec: 0,
    copedbId: null as number | null,
    achSource: "none" as const,
  };

  const rows: Array<Partial<Game> & Pick<Game, "id" | "title" | "titleEn" | "tintA" | "tintB">> = [
    {
      id: "frostfall",
      title: "霜落之城",
      titleEn: "FROSTFALL",
      appid: 2147730,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\Frostfall\\Frostfall.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\Frostfall",
      tintA: "#1f4a6b",
      tintB: "#081420",
      playtimeSec: 41.2 * 3600,
      lastPlayedAt: daysAgo(0, 14, 20),
      addedAt: daysAgo(100),
      favorite: true,
      studio: "Kestrel Studio",
      releaseDate: "2024 年 3 月",
      genres: ["动作", "独立"],
      description:
        "雪线之上的王城已经静默了四十年。你是最后一名巡夜人，带着一盏快要熄灭的灯，沿着旧城的中轴一路向上。每一次举灯都是一次判断——照亮什么，就会惊动什么。\n\n手工搭建的垂直城邦，没有地图，没有提示箭头。靠墙上的划痕、门缝里的冷风、以及你自己记下的路。支持存档回滚，一次错误的举灯不会毁掉一整晚。",
      descriptionOriginal:
        "The royal city above the snowline has been silent for forty years. You are the last night watchman, carrying a lamp that is about to go out, climbing the old city's central axis. Every time you raise the lamp is a judgment — what you light up will be disturbed.\n\nA hand-built vertical city-state with no map and no quest arrows. Read the scratches on walls, the cold wind through door gaps, and the path you wrote down yourself. Save rollback is supported, so one wrong lamp will not ruin a whole night.",
      publishers: ["Kestrel Studio"],
      categories: ["单人", "Steam 成就", "完全支持控制器", "Steam 云"],
      reviewTotal: 128430,
      metacritic: 88,
      tags: tag(1, 3),
      achTotal: 14,
      achUnlocked: 9,
      achSource: "local",
      modCount: 6,
    },
    {
      id: "neondrift",
      title: "霓虹漂移",
      titleEn: "NEON DRIFT",
      appid: 1883020,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\NeonDrift\\NeonDrift.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\NeonDrift",
      tintA: "#7b2f8f",
      tintB: "#1a0a26",
      playtimeSec: 12.6 * 3600,
      lastPlayedAt: daysAgo(1, 22, 41),
      addedAt: daysAgo(114),
      studio: "Afterglow Works",
      releaseDate: "2023 年 11 月",
      genres: ["角色扮演", "动作"],
      description:
        "雨永远不停的高架城。你是替人跑单的骑手，也是这座城里唯一还愿意记住路的人。每一次接单都在拿命换里程，而里程可以兑换任何东西——包括你不想记起的那段过去。\n\n手感偏重的街机竞速，配合大量支线对话。没有失败惩罚，只有你要不要继续跑下去。",
      tags: tag(2, 1),
      achTotal: 50,
      achUnlocked: 9,
      achSource: "steam",
      modCount: 3,
    },
    {
      id: "redtide",
      title: "赤潮",
      titleEn: "RED TIDE",
      appid: 990412,
      platform: "steam",
      exePath: "E:\\Games\\RedTide\\RedTide.exe",
      workDir: "E:\\Games\\RedTide",
      tintA: "#8a2a24",
      tintB: "#240b09",
      playtimeSec: 63.8 * 3600,
      lastPlayedAt: daysAgo(13),
      addedAt: daysAgo(221),
      favorite: true,
      studio: "Bastion Interactive",
      releaseDate: "2022 年 6 月",
      genres: ["动作", "模拟"],
      description:
        "远洋钻井平台在第九天失去联络。你是被派去收尾的人，带着一台只能再撑六小时的声呐。海面以下的东西不追你，它只是等你自己下沉。\n\n资源管理 + 环境恐怖的结合。每一个决定都要消耗氧气、电力或者退路。",
      tags: tag(1, 4),
      achTotal: 71,
      achUnlocked: 71,
      achSource: "steam",
      modCount: 2,
    },
    {
      id: "shanhai",
      title: "山海遗章",
      titleEn: "SHANHAI",
      appid: 1702850,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\Shanhai\\Shanhai.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\Shanhai",
      tintA: "#2f5560",
      tintB: "#0d1b20",
      playtimeSec: 51.5 * 3600,
      lastPlayedAt: daysAgo(15),
      addedAt: daysAgo(276),
      studio: "墨线工坊",
      releaseDate: "2023 年 7 月",
      genres: ["角色扮演", "独立"],
      description:
        "异兽不是敌人，是没被写完的注脚。你拿着一支墨笔走遍九州，把遇见的每一头都补进书里——写错的那些，会长回来找你。\n\n水墨风格回合制，战斗即对谈。结局取决于你在注脚里留下多少空白。",
      tags: tag(2, 3),
      achTotal: 38,
      achUnlocked: 23,
      achSource: "local",
      modCount: 2,
    },
    {
      id: "kowloon",
      title: "九龙街",
      titleEn: "KOWLOON ST.",
      appid: 1432100,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\KowloonSt\\KowloonSt.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\KowloonSt",
      tintA: "#1a5a66",
      tintB: "#081e26",
      playtimeSec: 22.7 * 3600,
      lastPlayedAt: daysAgo(17),
      addedAt: daysAgo(142),
      studio: "Three Lanterns",
      releaseDate: "2023 年 3 月",
      genres: ["独立", "角色扮演"],
      description:
        "一栋没有电梯的旧楼，三十七户人家，每家都有一件不愿卖的东西。你是上门收旧货的，也是唯一会敲门的人。\n\n章节式群像叙事，无战斗。每一单结束都可以选择不再回来。",
      tags: tag(3, 2),
      achTotal: 44,
      achUnlocked: 21,
      achSource: "steam",
      modCount: 1,
    },
    {
      id: "pinecone",
      title: "松果镇的夏天",
      titleEn: "PINECONE",
      appid: null,
      platform: "local",
      exePath: "F:\\Games\\Pinecone\\Pinecone.exe",
      workDir: "F:\\Games\\Pinecone",
      tintA: "#3f6b32",
      tintB: "#101f0d",
      playtimeSec: 34 * 3600,
      lastPlayedAt: daysAgo(21),
      addedAt: daysAgo(244),
      favorite: true,
      studio: "Little Fern",
      releaseDate: "2022 年 9 月",
      genres: ["模拟", "独立"],
      description:
        "整个镇子只有一个夏天，和一台永远修不好的收音机。你替邻居们跑腿，顺便把没说完的话说完。\n\n生活模拟 + 轻解谜，没有时间压力。每次存档都停在同一个午后。",
      tags: tag(4, 3),
      achTotal: 34,
      achUnlocked: 30,
      achSource: "local",
      modCount: 2,
    },
    {
      id: "deepsignal",
      title: "深空信号",
      titleEn: "DEEP SIGNAL",
      appid: null,
      platform: "epic",
      exePath: "D:\\Games\\DeepSignal\\DeepSignal.exe",
      workDir: "D:\\Games\\DeepSignal",
      tintA: "#1d5a4a",
      tintB: "#081a17",
      playtimeSec: 28.4 * 3600,
      lastPlayedAt: daysAgo(50),
      addedAt: daysAgo(59),
      studio: "Orbital Nine",
      releaseDate: "2025 年 2 月",
      genres: ["独立", "角色扮演"],
      description:
        "一颗不再回应地球的星球，一段被自动转译成诗的电波。你要做的不是解密，而是决定相信哪一个版本。\n\n慢节奏叙事探索，全程无战斗。所有收集品都会改变结局里的一封信。",
      tags: tag(3, 2),
      achTotal: 40,
      achUnlocked: 18,
      achSource: "manual",
      modCount: 1,
    },
    {
      id: "daydream",
      title: "白日梦列车",
      titleEn: "DAYDREAM LINE",
      appid: 2610880,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\DaydreamLine\\DaydreamLine.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\DaydreamLine",
      tintA: "#8a5a1e",
      tintB: "#2a1806",
      playtimeSec: 9.1 * 3600,
      lastPlayedAt: daysAgo(53),
      addedAt: daysAgo(74),
      studio: "Paper Lantern",
      releaseDate: "2024 年 8 月",
      genres: ["独立", "模拟"],
      description:
        "一列只在午后行驶的列车，乘客都是还没决定要不要醒来的人。你端着茶走过八节车厢，替他们决定。\n\n短篇叙事模拟，两小时可以走完，也可以慢慢泡一整套茶。",
      tags: tag(3, 4),
      achTotal: 32,
      achUnlocked: 12,
      achSource: "local",
      modCount: 2,
    },
    {
      id: "voidharbor",
      title: "虚空港",
      titleEn: "VOID HARBOR",
      appid: 2741660,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\VoidHarbor\\VoidHarbor.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\VoidHarbor",
      tintA: "#2a2f7a",
      tintB: "#0b0d24",
      playtimeSec: 6.3 * 3600,
      lastPlayedAt: daysAgo(62),
      addedAt: daysAgo(63),
      studio: "Nullspace",
      releaseDate: "2025 年 9 月",
      genres: ["动作", "独立"],
      description:
        "一座停泊在什么都没有的地方的港口，来往的船都是别人的记忆。你负责登记，不负责挽留。\n\n高速位移 + 空间谜题。每次停靠只允许带走一件东西。",
      tags: tag(1, 3),
      achTotal: 36,
      achUnlocked: 4,
      achSource: "steam",
      modCount: 1,
    },
    {
      id: "meridian",
      title: "铁之经纬",
      titleEn: "IRON MERIDIAN",
      appid: null,
      platform: "epic",
      exePath: "D:\\Games\\IronMeridian\\IronMeridian.exe",
      workDir: "D:\\Games\\IronMeridian",
      tintA: "#7a5230",
      tintB: "#221308",
      playtimeSec: 3.2 * 3600,
      lastPlayedAt: daysAgo(74),
      addedAt: daysAgo(77),
      studio: "Foundry Six",
      releaseDate: "2024 年 1 月",
      genres: ["模拟", "角色扮演"],
      description:
        "一条横穿大陆的窄轨铁路，和一张画错了三十年的地图。你要把两端的城市重新接上，代价是中间那些村子。\n\n铁路调度模拟，含大量表格与取舍。适合一边听播客一边调度。",
      tags: tag(4, 2),
      achTotal: 28,
      achUnlocked: 2,
      achSource: "manual",
      modCount: 0,
    },
    {
      id: "lastorbit",
      title: "最后的轨道",
      titleEn: "LAST ORBIT",
      appid: 2501330,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\LastOrbit\\LastOrbit.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\LastOrbit",
      tintA: "#2b3a8c",
      tintB: "#080d22",
      playtimeSec: 18.9 * 3600,
      lastPlayedAt: daysAgo(90),
      addedAt: daysAgo(292),
      studio: "Halcyon Drift",
      releaseDate: "2025 年 5 月",
      genres: ["模拟", "动作"],
      description:
        "空间站在第 4,102 圈开始偏离轨道。燃料只够一次修正，而地面已经不再回复你了。\n\n硬核轨道模拟，无存档。一次任务约 40 分钟。",
      tags: tag(4, 1),
      achTotal: 42,
      achUnlocked: 16,
      achSource: "steam",
      modCount: 1,
    },
    {
      id: "rainylot",
      title: "雨の停車場",
      titleEn: "RAINY LOT",
      appid: null,
      platform: "local",
      exePath: "F:\\Games\\RainyLot\\RainyLot.exe",
      workDir: "F:\\Games\\RainyLot",
      tintA: "#4a5260",
      tintB: "#121620",
      playtimeSec: 7.8 * 3600,
      lastPlayedAt: daysAgo(103),
      addedAt: daysAgo(331),
      studio: "Yugure",
      releaseDate: "2021 年 12 月",
      genres: ["独立"],
      description:
        "一个只在下雨天使用的停车场，和一辆没人来取的车。你在保安亭里听雨，等一个不会来的车主。\n\n一小时左右的短篇，全片没有一句配音。",
      tags: tag(3),
      achTotal: 16,
      achUnlocked: 5,
      achSource: "manual",
      modCount: 0,
    },
    {
      id: "ashenvale",
      title: "灰烬之谷",
      titleEn: "ASHEN VALE",
      appid: null,
      platform: "local",
      exePath: "F:\\Games\\AshenVale\\AshenVale.exe",
      workDir: "F:\\Games\\AshenVale",
      tintA: "#4a4f56",
      tintB: "#14171b",
      playtimeSec: 0,
      lastPlayedAt: null,
      addedAt: daysAgo(178),
      studio: "Rustline Studio",
      releaseDate: "2021 年 4 月",
      genres: ["角色扮演", "动作"],
      description:
        "灰烬掩埋的王朝废墟里，只剩下一座还在打铁的铁匠铺。你把捡来的旧剑重新锻成新的名字。\n\n慢节奏锻造动作游戏。本地 exe 手动添加，成就通道尚未探测。",
      tags: tag(2, 1),
      achTotal: 24,
      achUnlocked: 0,
      achSource: "none",
      modCount: 0,
    },
    {
      id: "titan",
      title: "泰坦熔炉",
      titleEn: "TITAN FOUNDRY",
      appid: 2890120,
      platform: "steam",
      exePath: "D:\\SteamLibrary\\steamapps\\common\\TitanFoundry\\TitanFoundry.exe",
      workDir: "D:\\SteamLibrary\\steamapps\\common\\TitanFoundry",
      tintA: "#8a3a1a",
      tintB: "#260d05",
      playtimeSec: 0,
      lastPlayedAt: null,
      addedAt: daysAgo(9),
      studio: "Ironclad Mass",
      releaseDate: "2026 年 1 月",
      genres: ["动作", "模拟"],
      description:
        "把一整座山的矿石喂进一台城市那么大的熔炉，然后看看它吐出来的是钢铁，还是别的什么。\n\n工厂自动化 + 巨物战斗。刚入库，还没有启动过。",
      tags: tag(1, 4),
      achTotal: 52,
      achUnlocked: 0,
      achSource: "steam",
      modCount: 0,
    },
  ];

  return rows.map((r) => ({ ...base, ...r, addedAt: r.addedAt ?? daysAgo(100), id: r.id, modCount: r.modCount ?? 0 }) as Game);
}

const ACH_SEED: Array<Omit<Achievement, "gameId" | "id">> = [
  { apiName: "ACH_FIRST_LIGHT", name: "第一盏灯", description: "在旧城点燃了你的第一盏巡夜灯。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 92.4, unlocked: true, unlockedAt: daysAgo(100, 21, 14), source: "local", tintA: "#3d7fb5", tintB: "#16324a" },
  { apiName: "ACH_ABOVE_SNOWLINE", name: "雪线之上", description: "抵达王城的最高平台。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 38.1, unlocked: true, unlockedAt: daysAgo(97, 23, 41), source: "local", tintA: "#8a5a1e", tintB: "#2a1806" },
  { apiName: "ACH_NO_LOCKED_DOOR", name: "不留一室", description: "打开旧城里每一扇没有上锁的门。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 6.2, unlocked: true, unlockedAt: daysAgo(91, 2, 7), source: "local", tintA: "#1d5a4a", tintB: "#081a17" },
  { apiName: "ACH_NEVER_LOOKED_BACK", name: "一次也没回头", description: "全程没有使用存档回滚。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 14.7, unlocked: true, unlockedAt: daysAgo(91, 2, 44), source: "local", tintA: "#7b2f8f", tintB: "#1a0a26" },
  { apiName: "ACH_WINTER_STORY", name: "冬夜的故事", description: "听完巡夜人讲的那个故事。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 51, unlocked: true, unlockedAt: daysAgo(69, 20, 30), source: "manual", tintA: "#4a5260", tintB: "#121620" },
  { apiName: "ACH_BEFORE_LIGHT_DIES", name: "灯灭之前", description: "在灯光耗尽前 10 秒内抵达尽头。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 3.4, unlocked: true, unlockedAt: daysAgo(57, 1, 22), source: "local", tintA: "#2b3a8c", tintB: "#080d22" },
  { apiName: "ACH_LAST_PAGE", name: "最后一页", description: "读完制作名单，并且看到了最后那行小字。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 41.8, unlocked: true, unlockedAt: daysAgo(38, 0, 12), source: "local", tintA: "#5c7a2e", tintB: "#18240c" },
  { apiName: "ACH_ALL_SEEING", name: "全知之眼", description: "收集旧城中全部 24 页手记。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 1.6, unlocked: true, unlockedAt: daysAgo(43, 22, 10), source: "local", tintA: "#3f6b32", tintB: "#101f0d" },
  { apiName: "ACH_EMPTY_HANDED", name: "空空如也", description: "把背包清空后离开王城。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 22.5, unlocked: true, unlockedAt: daysAgo(32, 19, 40), source: "manual", tintA: "#2f5560", tintB: "#0d1b20" },
  { apiName: "ACH_SILENT_CHOIR", name: "沉默的合唱", description: "在钟楼上待满一整夜。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 9.3, unlocked: false, unlockedAt: null, source: "local", tintA: "#8a3a1a", tintB: "#260d05" },
  { apiName: "ACH_SECOND_WATCH", name: "第二次巡夜", description: "以二周目难度完成整个故事。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 4.8, unlocked: false, unlockedAt: null, source: "local", tintA: "#1a5a66", tintB: "#081e26" },
  { apiName: "ACH_SOFT_STEPS", name: "轻手轻脚", description: "全程没有惊动任何一个守卫。", iconUrl: null, iconGrayUrl: null, hidden: false, globalPercent: 2.1, unlocked: false, unlockedAt: null, source: "local", tintA: "#6a3a6e", tintB: "#1c0e1e" },
  { apiName: "ACH_HIDDEN_1", name: "隐藏成就", description: "继续游玩以揭示这个成就。", iconUrl: null, iconGrayUrl: null, hidden: true, globalPercent: null, unlocked: false, unlockedAt: null, source: "local", tintA: "#4a4f56", tintB: "#14171b" },
  { apiName: "ACH_HIDDEN_2", name: "隐藏成就", description: "继续游玩以揭示这个成就。", iconUrl: null, iconGrayUrl: null, hidden: true, globalPercent: null, unlocked: false, unlockedAt: null, source: "local", tintA: "#4a4f56", tintB: "#14171b" },
];

export const DEMO_MODS: ModEntry[] = [
  { id: 1, gameId: "frostfall", dirName: "fonts", name: "霜落之城 · 中文字体修正", version: "1.4.0 · fonts", sizeBytes: 18 * 1024 * 1024, enabled: true, orderIndex: 0 },
  { id: 2, gameId: "frostfall", dirName: "lumen", name: "更好的灯效 (Lumen Rework)", version: "2.1.0 · graphics", sizeBytes: 246 * 1024 * 1024, enabled: true, orderIndex: 1 },
  { id: 3, gameId: "frostfall", dirName: "camera", name: "第一人称镜头", version: "0.9.3 · camera", sizeBytes: 4 * 1024 * 1024, enabled: true, orderIndex: 2 },
  { id: 4, gameId: "frostfall", dirName: "no-hit", name: "无伤挑战统计", version: "1.0.1 · utility", sizeBytes: 1 * 1024 * 1024, enabled: false, orderIndex: 3 },
  { id: 5, gameId: "frostfall", dirName: "map", name: "旧城地图补全", version: "3.0.0 · world", sizeBytes: 92 * 1024 * 1024, enabled: false, orderIndex: 4 },
  { id: 6, gameId: "frostfall", dirName: "dev-console", name: "开发者控制台", version: "— · dev", sizeBytes: 300 * 1024, enabled: false, orderIndex: 5 },
];

interface DemoState {
  games: Game[];
  tags: Tag[];
  achievements: Record<string, Achievement[]>;
  settings: Settings;
  favRevision: number;
}

const KEY = "starbox.demo.v1";

function defaultSettings(): Settings {
  return {
    hasApiKey: false,
    steamId: null,
    sortDefault: "recent",
    viewMode: "grid",
    cardSize: "standard",
    reduceMotion: false,
    showHidden: false,
    locale: "zh-CN",
    dataDir: "%APPDATA%\\StarBox",
    version: "0.1.0",
  };
}

function cloneDefaultTags(): Tag[] {
  return TAGS.map((t) => ({ ...t }));
}

/** 游戏里内嵌的是标签对象的快照：标签被改名/删除后按 id 重新绑定。 */
function rebindTags(games: Game[], tags: Tag[]) {
  for (const g of games) {
    const ids = new Set(g.tags.map((x) => x.id));
    g.tags = tags.filter((x) => ids.has(x.id));
  }
}

function freshState(): DemoState {
  const tags = cloneDefaultTags();
  const games = seedGames();
  rebindTags(games, tags);
  return {
    games,
    tags,
    achievements: {
      frostfall: ACH_SEED.map((a, i) => ({ ...a, id: i + 1, gameId: "frostfall" })),
    },
    settings: defaultSettings(),
    favRevision: 0,
  };
}

let state: DemoState = load();

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed?.games?.length) {
        const base = freshState();
        const tags = Array.isArray(parsed.tags) ? parsed.tags : base.tags;
        rebindTags(parsed.games, tags);
        return {
          ...base,
          ...parsed,
          tags,
          settings: { ...defaultSettings(), ...parsed.settings },
        };
      }
    }
  } catch {
    /* 忽略损坏的演示数据 */
  }
  return freshState();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 忽略存储失败 */
  }
}

export function resetDemo() {
  state = freshState();
  persist();
}

const sessions = new Map<string, { pid: number; startedAt: string }>();

function game(id: string): Game | undefined {
  return state.games.find((g) => g.id === id);
}

function withSession(g: Game): Game {
  const s = sessions.get(g.id);
  if (!s) return { ...g, running: false, sessionSec: 0 };
  const sec = Math.max(0, Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000));
  return { ...g, running: true, sessionSec: sec };
}

export const demoApi = {
  async appInfo(): Promise<AppInfo> {
    return { version: "0.1.0", dataDir: "%APPDATA%\\StarBox", demo: true };
  },

  async listGames(): Promise<Game[]> {
    return sortGames(state.games.map(withSession), "recent");
  },

  async listTags(): Promise<Tag[]> {
    return state.tags;
  },

  async createTag(name: string, color: string): Promise<Tag> {
    const clean = name.trim();
    if (!clean) throw new Error("标签名不能为空");
    if (state.tags.some((t) => t.name === clean)) throw new Error("已经有同名标签");
    const tag: Tag = { id: Math.max(0, ...state.tags.map((t) => t.id)) + 1, name: clean, color };
    state.tags.push(tag);
    persist();
    return tag;
  },

  async updateTag(id: number, name: string, color: string): Promise<Tag> {
    const tag = state.tags.find((t) => t.id === id);
    if (!tag) throw new Error("标签不存在");
    const clean = name.trim();
    if (!clean) throw new Error("标签名不能为空");
    if (state.tags.some((t) => t.id !== id && t.name === clean)) throw new Error("已经有同名标签");
    tag.name = clean;
    tag.color = color;
    rebindTags(state.games, state.tags);
    persist();
    return { ...tag };
  },

  async deleteTag(id: number): Promise<void> {
    state.tags = state.tags.filter((t) => t.id !== id);
    for (const g of state.games) g.tags = g.tags.filter((t) => t.id !== id);
    persist();
  },

  async launch(gameId: string): Promise<LaunchInfo> {
    const g = game(gameId);
    if (!g) throw new Error("游戏不存在");
    const wasRunning = sessions.has(gameId);
    const startedAt = new Date().toISOString();
    if (!wasRunning) sessions.set(gameId, { pid: 4200 + sessions.size, startedAt });
    g.lastPlayedAt = startedAt;
    persist();
    return { gameId, pid: sessions.get(gameId)!.pid, startedAt, focused: wasRunning };
  },

  async stop(gameId: string): Promise<boolean> {
    const s = sessions.get(gameId);
    const g = game(gameId);
    if (!s || !g) return false;
    const sec = Math.max(0, Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000));
    g.playtimeSec += sec;
    sessions.delete(gameId);
    persist();
    return true;
  },

  async setFavorite(gameId: string, favorite: boolean): Promise<void> {
    const g = game(gameId);
    if (g) g.favorite = favorite;
    persist();
  },

  async setHidden(gameId: string, hidden: boolean): Promise<void> {
    const g = game(gameId);
    if (g) g.hidden = hidden;
    persist();
  },

  async updatePaths(gameId: string, exePath: string, workDir: string, args: string): Promise<void> {
    const g = game(gameId);
    if (!g) return;
    g.exePath = exePath;
    g.workDir = workDir;
    g.args = args;
    persist();
  },

  async setCover(gameId: string, path: string | null): Promise<void> {
    const g = game(gameId);
    if (!g) return;
    g.coverPath = path;
    persist();
  },

  async setTags(gameId: string, tagIds: number[]): Promise<void> {
    const g = game(gameId);
    if (!g) return;
    g.tags = state.tags.filter((t) => tagIds.includes(t.id));
    persist();
  },

  async setTitles(gameId: string, title: string, titleEn: string | null): Promise<void> {
    const g = game(gameId);
    if (!g) return;
    g.title = title.trim() || g.title;
    g.titleEn = titleEn?.trim() || null;
    persist();
  },

  async scanFolder(path: string): Promise<FolderCandidate[]> {
    const base = path.replace(/[\\/]+$/, "");
    const name = base.split(/[\\/]/).pop() || "DemoGame";
    return [
      { path: `${base}\\${name}.exe`, name, sizeBytes: 42 * 1024 * 1024, likelyMain: true, inLibrary: false },
      { path: `${base}\\bin\\Win64\\${name}-Win64-Shipping.exe`, name, sizeBytes: 88 * 1024 * 1024, likelyMain: false, inLibrary: false },
      { path: `${base}\\Launcher.exe`, name: `${name} Launcher`, sizeBytes: 3 * 1024 * 1024, likelyMain: false, inLibrary: false },
    ];
  },

  async deleteGame(gameId: string): Promise<void> {
    state.games = state.games.filter((g) => g.id !== gameId);
    persist();
  },

  async scanLibraries(): Promise<ScanResult> {
    const installed = new Set(state.games.map((g) => `${g.platform}:${g.appid ?? g.title}`));
    const picks = [
      { source: "steam" as const, appid: 2890120, title: "Titan Foundry", installDir: "D:\\SteamLibrary\\steamapps\\common\\TitanFoundry", exePath: "D:\\SteamLibrary\\steamapps\\common\\TitanFoundry\\TitanFoundry.exe", playtimeSec: 0, lastPlayedAt: null },
      { source: "steam" as const, appid: 3120900, title: "Salt & Circuit", installDir: "D:\\SteamLibrary\\steamapps\\common\\SaltCircuit", exePath: "D:\\SteamLibrary\\steamapps\\common\\SaltCircuit\\SaltCircuit.exe", playtimeSec: 3.4 * 3600, lastPlayedAt: daysAgo(6) },
      { source: "steam" as const, appid: 1742300, title: "北境邮差 · North Courier", installDir: "E:\\SteamLibrary\\steamapps\\common\\NorthCourier", exePath: "E:\\SteamLibrary\\steamapps\\common\\NorthCourier\\NorthCourier.exe", playtimeSec: 26 * 3600, lastPlayedAt: daysAgo(30) },
      { source: "epic" as const, appid: null, title: "Aether Bloom", installDir: "D:\\Epic\\AetherBloom", exePath: "D:\\Epic\\AetherBloom\\AetherBloom.exe", playtimeSec: 0, lastPlayedAt: null },
      { source: "epic" as const, appid: null, title: "Signal Lost", installDir: "D:\\Epic\\SignalLost", exePath: "D:\\Epic\\SignalLost\\SignalLost.exe", playtimeSec: 1.2 * 3600, lastPlayedAt: daysAgo(45) },
    ];
    return {
      picks,
      steamRoot: "D:\\SteamLibrary",
      epicRoot: "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
      steamCount: 3,
      epicCount: 2,
      warnings: [],
      alreadyInLibrary: picks.filter((p) => installed.has(`${p.source}:${p.appid ?? p.title}`)).length,
    };
  },

  async importPicks(picks: import("@/types").ScanPick[]): Promise<Game[]> {
    const added: Game[] = [];
    for (const p of picks) {
      if (state.games.some((g) => g.exePath === p.exePath || (p.appid && g.appid === p.appid && g.platform === p.source))) continue;
      const g: Game = {
        id: `scan-${p.source}-${p.appid ?? Date.now()}`,
        title: p.title,
        titleEn: p.title,
        appid: p.appid,
        platform: p.source,
        exePath: p.exePath,
        workDir: p.installDir,
        args: null,
        coverPath: null,
        bannerPath: null,
        tintA: "#1f4a6b",
        tintB: "#081420",
        playtimeSec: p.playtimeSec,
        lastPlayedAt: p.lastPlayedAt,
        addedAt: new Date().toISOString(),
        favorite: false,
        hidden: false,
        studio: null,
        releaseDate: null,
        description: null,
        descriptionOriginal: null,
        screenshots: [],
        genres: [],
        publishers: [],
        categories: [],
        reviewTotal: null,
        metacritic: null,
        tags: [],
        achTotal: 0,
        achUnlocked: 0,
        achSource: "none",
        modCount: 0,
        modsDir: null,
        running: false,
        sessionSec: 0,
        copedbId: null,
      };
      state.games.push(g);
      added.push(g);
    }
    persist();
    return added;
  },

  async addGame(path: string): Promise<Game> {
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? "未命名游戏";
    const title = name.replace(/\.exe$/i, "");
    const g: Game = {
      id: `local-${Date.now()}`,
      title,
      titleEn: title.toUpperCase(),
      appid: null,
      platform: "local",
      exePath: path,
      workDir: path.replace(/[\\/][^\\/]+$/, ""),
      args: null,
      coverPath: null,
      bannerPath: null,
      tintA: "#2f5560",
      tintB: "#0d1b20",
      playtimeSec: 0,
      lastPlayedAt: null,
      addedAt: new Date().toISOString(),
      favorite: false,
      hidden: false,
      studio: null,
      releaseDate: null,
      description: null,
      descriptionOriginal: null,
      screenshots: [],
      genres: [],
      publishers: [],
      categories: [],
      reviewTotal: null,
      metacritic: null,
      tags: [],
      achTotal: 0,
      achUnlocked: 0,
      achSource: "none",
      modCount: 0,
      modsDir: null,
      running: false,
      sessionSec: 0,
      copedbId: null,
    };
    state.games.push(g);
    persist();
    return g;
  },

  async refreshSteam(gameId: string): Promise<{ game: Game; coverDownloaded: boolean; message: string | null }> {
    const g = game(gameId);
    if (!g) throw new Error("游戏不存在");
    g.studio = g.studio ?? "—";
    persist();
    return { game: withSession(g), coverDownloaded: false, message: "演示数据不会联网抓取" };
  },

  async searchSteam(query: string): Promise<SteamSearchItem[]> {
    const all: SteamSearchItem[] = [
      { appid: 900001, name: "Lantern Hollow", nameEn: "Lantern Hollow", tinyImage: null, price: "¥ 58.00", score: null },
      { appid: 900002, name: "灯笼谷：余烬之歌", nameEn: "Lantern Hollow: Ember Song", tinyImage: null, price: "¥ 76.00", score: null },
      { appid: 900003, name: "两人成行", nameEn: "Two Of Us", tinyImage: null, price: "¥ 198.00", score: null },
      { appid: 900004, name: "铬金属安魂曲", nameEn: "Chrome Requiem", tinyImage: null, price: "¥ 128.00", score: null },
    ];
    const q = query.trim().toLowerCase();
    return all
      .filter((x) => !q || x.name.toLowerCase().includes(q) || (x.nameEn ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  },

  async searchSteamForGame(gameId: string): Promise<SteamSearchItem[]> {
    const g = game(gameId);
    if (!g) return [];
    const list = await demoApi.searchSteam(g.title);
    return list.map((x) => ({ ...x, score: x.name === g.title ? 100 : 55 }));
  },

  async matchSteam(gameId: string, appid: number) {
    const g = game(gameId);
    if (!g) throw new Error("游戏不存在");
    g.appid = appid;
    g.platform = "steam";
    persist();
    return { game: withSession(g), coverDownloaded: false, message: "演示模式：已绑定 AppID" };
  },

  async fetchAchievements(gameId: string): Promise<{ game: Game; count: number; message: string | null }> {
    const g = game(gameId);
    if (!g) throw new Error("游戏不存在");
    if (!state.achievements[gameId]) state.achievements[gameId] = ACH_SEED.map((a, i) => ({ ...a, id: i + 1, gameId }));
    const list = state.achievements[gameId];
    g.achTotal = list.length;
    g.achUnlocked = list.filter((a) => a.unlocked).length;
    if (g.achSource === "none") g.achSource = "local";
    persist();
    return { game: withSession(g), count: list.length, message: null };
  },

  async listAchievements(gameId: string): Promise<Achievement[]> {
    return state.achievements[gameId] ?? [];
  },

  async setAchievementUnlocked(achievementId: number, unlocked: boolean): Promise<void> {
    for (const list of Object.values(state.achievements)) {
      const a = list.find((x) => x.id === achievementId);
      if (a) {
        a.unlocked = unlocked;
        a.unlockedAt = unlocked ? new Date().toISOString() : null;
        a.source = unlocked ? "manual" : a.source;
        const g = game(a.gameId);
        if (g) g.achUnlocked = list.filter((x) => x.unlocked).length;
      }
    }
    persist();
  },

  async listMods(gameId: string): Promise<ModEntry[]> {
    return DEMO_MODS.filter((m) => m.gameId === gameId);
  },

  async scanMods(gameId: string): Promise<ModEntry[]> {
    return DEMO_MODS.filter((m) => m.gameId === gameId);
  },

  async setModsDir(gameId: string, dir: string): Promise<void> {
    const g = game(gameId);
    if (g) g.modsDir = dir;
    persist();
  },

  async setModEnabled(modId: number, enabled: boolean): Promise<void> {
    const m = DEMO_MODS.find((x) => x.id === modId);
    if (m) m.enabled = enabled;
  },

  async getSettings(): Promise<Settings> {
    return state.settings;
  },

  async saveSettings(patch: Partial<Settings> & { steamApiKey?: string }): Promise<Settings> {
    const { steamApiKey, ...rest } = patch;
    state.settings = { ...state.settings, ...rest };
    if (steamApiKey !== undefined && steamApiKey !== "") state.settings.hasApiKey = true;
    persist();
    return state.settings;
  },
};
