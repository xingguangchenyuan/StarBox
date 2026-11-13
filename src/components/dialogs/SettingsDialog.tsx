import { useMemo, useState } from "react";
import { t } from "@/i18n/zh-CN";
import { Dialog } from "@/components/Dialog";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { api, isDemo } from "@/lib/api";
import { resetDemo } from "@/lib/demo";
import { IconCopy, IconFolder, IconKey, IconRefresh, IconScan } from "@/components/Icons";
import { TagManager } from "@/components/dialogs/TagManager";

type Group = "steam" | "library" | "tags" | "appearance" | "data" | "about";

const GROUPS: Array<{ key: Group; label: string; hint: string }> = [
  { key: "steam", label: "Steam 账号与接口", hint: "Key 与 SteamID64" },
  { key: "library", label: "游戏库", hint: "扫描、刷新、同步" },
  { key: "tags", label: "分类标签", hint: "颜色与命名" },
  { key: "appearance", label: "外观", hint: "封面、动效、视图" },
  { key: "data", label: "数据", hint: "目录与体积" },
  { key: "about", label: "关于", hint: "版本与快捷键" },
];

export function SettingsDialog() {
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const games = useApp((s) => s.games);
  const patchSettings = useApp((s) => s.patchSettings);
  const reload = useApp((s) => s.reload);
  const refreshAllSteam = useApp((s) => s.refreshAllSteam);
  const syncAllAchievements = useApp((s) => s.syncAllAchievements);
  const refreshing = useApp((s) => s.refreshing);
  const viewMode = useApp((s) => s.viewMode);
  const setViewMode = useApp((s) => s.setViewMode);
  const [group, setGroup] = useState<Group>("steam");
  const [key, setKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [steamId, setSteamId] = useState(settings?.steamId ?? "");
  const [syncingAll, setSyncingAll] = useState(false);

  const achCount = useMemo(() => games.reduce((s, g) => s + g.achTotal, 0), [games]);

  const saveKey = async () => {
    const trimmed = key.trim();
    if (!trimmed && !steamId.trim()) return;
    await patchSettings({ ...(trimmed ? { steamApiKey: trimmed } : {}), steamId: steamId.trim() || null });
    setKey("");
    setEditingKey(false);
    toast.info(trimmed ? t("settings.steamKeySaved") : "已保存 Steam ID", "设置", "Steam");
  };

  const refreshAll = async () => {
    const res = await refreshAllSteam();
    if (!res.total) {
      toast.warn("库里没有带 AppID 的 Steam 游戏", "先扫描一次 Steam 库", "Steam");
      return;
    }
    await reload();
    toast.info(
      `已刷新 ${res.ok} 个游戏的商店资料`,
      res.fail ? `${res.fail} 个失败（网络或限流）` : "简介 / 封面 / 中文名已更新",
      "Steam",
    );
  };

  const clearKey = async () => {
    try {
      await patchSettings({ clearApiKey: true });
      setKey("");
      toast.info("已清除 Steam Web API Key", "设置", "Steam");
    } catch (e) {
      toast.warn("清除 Key 失败", String(e), "Steam");
    }
  };

  const openDataDir = async () => {
    try {
      await api.openDataDir();
    } catch (e) {
      toast.warn("打开数据目录失败", String(e), "权限");
    }
  };

  const copyDataDir = async () => {
    try {
      await navigator.clipboard.writeText(info?.dataDir ?? "");
      toast.info("数据目录已复制", info?.dataDir ?? "", "数据");
    } catch {
      toast.warn("复制失败", "可以手动选中路径", "数据");
    }
  };

  const detectId = async () => {
    try {
      const id = await api.detectSteamId();
      if (!id) {
        toast.warn("没找到本机 Steam 账号", "请确认 Steam 已登录过，或手动填 SteamID64", "Steam");
        return;
      }
      setSteamId(id);
      await patchSettings({ steamId: id });
      toast.info("已填入本机 SteamID64", id, "Steam");
    } catch (e) {
      toast.warn("读取 SteamID 失败", String(e), "Steam");
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await syncAllAchievements("auto");
      toast.info(
        res.message ?? `已同步 ${res.synced} 个游戏`,
        res.failed ? `${res.failed} 个失败` : "Steam / 本地文件",
        "成就",
      );
    } catch (e) {
      toast.warn("同步全部成就失败", String(e), "成就");
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <Dialog title={t("settings.title")} onClose={close} size="lg" className="settings-dialog">
      <div className="settings-layout">
        <div className="settings-nav">
          <div className="settings-status">
            <span className={`dot${settings?.hasApiKey ? " is-ok" : ""}`} />
            <div>
              <b>{settings?.hasApiKey ? "Steam Key 已保存" : "未填写 Steam Key"}</b>
              <span>{isDemo ? "浏览器预览模式" : `v${info?.version ?? "0.1.0"} · 本地数据`}</span>
            </div>
          </div>
          {GROUPS.map((g) => (
            <button
              key={g.key}
              className={`settings-nav-item${group === g.key ? " is-on" : ""}`}
              onClick={() => setGroup(g.key)}
            >
              <span className="lbl">{g.label}</span>
              <span className="sub">{g.hint}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {group === "steam" && (
            <>
              <div className="settings-h1">
                Steam 账号与接口
                <span className="desc">读取成就定义与账号解锁状态，只读，不需要登录。</span>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>Steam Web API Key</b>
                    <span>免费申请，本地用 Windows DPAPI 加密保存。</span>
                  </div>
                  {settings?.hasApiKey && !editingKey && (
                    <div className="row-actions">
                      <button className="btn-secondary sm" onClick={() => setEditingKey(true)}>
                        更换
                      </button>
                      <button className="ghost-mini" onClick={() => void clearKey()}>
                        清除
                      </button>
                    </div>
                  )}
                </div>

                {settings?.hasApiKey && !editingKey ? (
                  <div className="key-saved">
                    <span className="masked">••••••••••••••••</span>
                    <span className="badge-ok">已保存 · DPAPI 加密</span>
                  </div>
                ) : (
                  <div className="key-input-row">
                    <div className="input-with-icon">
                      <IconKey size={13} />
                      <input
                        className="text-input"
                        type="password"
                        value={key}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={settings?.hasApiKey ? "输入新 Key 以替换" : t("settings.steamKeyPlaceholder")}
                        onChange={(e) => setKey(e.target.value)}
                      />
                    </div>
                    <button className="btn-primary" onClick={() => void saveKey()} disabled={!key.trim() && !steamId.trim()}>
                      {t("common.save")}
                    </button>
                    {settings?.hasApiKey && (
                      <button className="btn-secondary" onClick={() => setEditingKey(false)}>
                        取消
                      </button>
                    )}
                  </div>
                )}
                <div className="setting-hint">
                  {t("settings.steamKeyHint")}
                  <a
                    href="https://steamcommunity.com/dev/apikey"
                    onClick={(e) => {
                      e.preventDefault();
                      void api.openUrl("https://steamcommunity.com/dev/apikey");
                    }}
                  >
                    申请地址 →
                  </a>
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>SteamID64</b>
                    <span>填入后可读取该账号的成就解锁状态；不填只拉成就定义。</span>
                  </div>
                </div>
                <div className="key-input-row">
                  <input
                    className="text-input"
                    value={steamId}
                    spellCheck={false}
                    placeholder="7656119xxxxxxxxxx"
                    onChange={(e) => setSteamId(e.target.value)}
                    onBlur={() => void patchSettings(steamId.trim() ? { steamId: steamId.trim() } : { clearSteamId: true })}
                  />
                  <button className="btn-secondary" onClick={() => void detectId()}>
                    读取本机
                  </button>
                </div>
                <div className="setting-hint">
                  从 Steam 的 <span className="mono">loginusers.vdf</span> 读取当前登录账号。公开资料里「游戏详情」需要设为公开，接口才读得到。
                </div>
              </div>
            </>
          )}

          {group === "library" && (
            <>
              <div className="settings-h1">
                游戏库
                <span className="desc">扫描、刷新和同步都是一次性动作，进度会显示在按钮上。</span>
              </div>
              <div className="action-list">
                <div className="action-row">
                  <div>
                    <b>扫描 Steam / Epic 库</b>
                    <span>读取本机已安装的库清单，带 AppID 和真实时长导入。</span>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      close();
                      open("scan");
                    }}
                  >
                    <IconScan size={12} />
                    开始扫描
                  </button>
                </div>
                <div className="action-row">
                  <div>
                    <b>刷新全部 Steam 资料</b>
                    <span>重新拉取简介、分类、截图和封面，已缓存的内容会被覆盖。</span>
                  </div>
                  <button className="btn-secondary" onClick={() => void refreshAll()} disabled={refreshing}>
                    <IconRefresh size={12} />
                    {refreshing ? "刷新中…" : "刷新全部"}
                  </button>
                </div>
                <div className="action-row">
                  <div>
                    <b>同步全部成就</b>
                    <span>Steam 账号优先，其次读本地 GSE / RUNE 成就文件。</span>
                  </div>
                  <button className="btn-secondary" onClick={() => void syncAll()} disabled={syncingAll}>
                    <IconRefresh size={12} />
                    {syncingAll ? "同步中…" : "同步成就"}
                  </button>
                </div>
              </div>
              <div className="setting-hint" style={{ marginTop: 12 }}>
                商店资料缓存本地，断网也能看；成就定义需要 Key。
              </div>
            </>
          )}

          {group === "tags" && (
            <>
              <div className="settings-h1">
                分类标签
                <span className="desc">标签就是分类：改名、换色、删除都会立刻同步到侧栏和详情页。</span>
              </div>
              <TagManager />
            </>
          )}

          {group === "appearance" && (
            <>
              <div className="settings-h1">
                外观
                <span className="desc">改动即时生效，不需要保存。</span>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>封面尺寸</b>
                    <span>大封面适合 1440px 以上的窗口；标准尺寸一屏能多看两列。</span>
                  </div>
                </div>
                <div className="size-picker">
                  <button
                    className={`size-opt${settings?.cardSize !== "large" ? " is-on" : ""}`}
                    onClick={() => void patchSettings({ cardSize: "standard" })}
                  >
                    <span className="prev is-standard">
                      <i />
                      <i />
                      <i />
                    </span>
                    <b>{t("settings.cardSizeGrid")}</b>
                  </button>
                  <button
                    className={`size-opt${settings?.cardSize === "large" ? " is-on" : ""}`}
                    onClick={() => void patchSettings({ cardSize: "large" })}
                  >
                    <span className="prev is-large">
                      <i />
                      <i />
                    </span>
                    <b>{t("settings.cardSizeWide")}</b>
                  </button>
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>默认视图</b>
                    <span>下次打开星匣时使用封面墙还是列表。</span>
                  </div>
                  <div className="seg" role="group" aria-label="默认视图">
                    <button
                      className={`seg-item is-wide${viewMode === "grid" ? " is-on" : ""}`}
                      onClick={() => setViewMode("grid")}
                    >
                      封面墙
                    </button>
                    <button
                      className={`seg-item is-wide${viewMode === "list" ? " is-on" : ""}`}
                      onClick={() => setViewMode("list")}
                    >
                      列表
                    </button>
                  </div>
                </div>
              </div>

              <div className="setting-block">
                <div className="switch-row">
                  <div>
                    <b>减少动效</b>
                    <span>关闭位移与缩放动画，运行中呼吸点变为静态。</span>
                  </div>
                  <button
                    className={`switch${settings?.reduceMotion ? " is-on" : ""}`}
                    role="switch"
                    aria-checked={!!settings?.reduceMotion}
                    onClick={() => void patchSettings({ reduceMotion: !settings?.reduceMotion })}
                  />
                </div>
                <div className="switch-row">
                  <div>
                    <b>显示已隐藏的游戏</b>
                    <span>隐藏只是从库视图里拿掉，不会删除记录。</span>
                  </div>
                  <button
                    className={`switch${settings?.showHidden ? " is-on" : ""}`}
                    role="switch"
                    aria-checked={!!settings?.showHidden}
                    onClick={() => void patchSettings({ showHidden: !settings?.showHidden })}
                  />
                </div>
              </div>
            </>
          )}

          {group === "data" && (
            <>
              <div className="settings-h1">
                数据
                <span className="desc">游戏库、封面和成就图标都在这个目录里。</span>
              </div>
              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>数据目录</b>
                    <span>SQLite 数据库与封面缓存。</span>
                  </div>
                  <div className="row-actions">
                    <button className="btn-secondary sm" onClick={() => void copyDataDir()}>
                      <IconCopy size={11} />
                      复制路径
                    </button>
                    <button className="btn-secondary sm" onClick={() => void openDataDir()}>
                      <IconFolder size={11} />
                      打开
                    </button>
                  </div>
                </div>
                <div className="path-box mono">{info?.dataDir ?? "—"}</div>
              </div>

              <div className="stat-cards">
                <div className="stat-card">
                  <b>{games.length}</b>
                  <span>个游戏</span>
                </div>
                <div className="stat-card">
                  <b>{achCount}</b>
                  <span>条成就定义</span>
                </div>
                <div className="stat-card">
                  <b>{games.reduce((s, g) => s + (g.achUnlocked ?? 0), 0)}</b>
                  <span>个已解锁</span>
                </div>
              </div>

              <div className="setting-hint">
                导出 / 导入备份属于第二版。现在换电脑需要重新扫描并填写 Key；游戏记录不会跟着走。
              </div>

              {isDemo && (
                <div className="setting-block">
                  <div className="switch-row">
                    <div>
                      <b>演示数据</b>
                      <span>重置后浏览器里的假数据回到初始状态。</span>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        resetDemo();
                        void reload();
                        toast.info(t("settings.resetDemo"), "演示数据已恢复初始状态");
                      }}
                    >
                      <IconRefresh size={11} />
                      重置
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {group === "about" && (
            <>
              <div className="settings-h1">
                关于
                <span className="desc">星匣 StarBox 是本机游戏库管家：把散落在各处的游戏收进一堵封面墙。</span>
              </div>

              <div className="about-head">
                <div className="about-mark">
                  <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
                    <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M12 6.4l1.62 3.62 3.94.44-2.92 2.68.79 3.88L12 15.1l-3.43 1.92.79-3.88-2.92-2.68 3.94-.44z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <b>星匣 StarBox</b>
                  <span>
                    v{info?.version ?? "0.1.0"} · {isDemo ? "浏览器预览模式" : "Tauri 桌面版"}
                  </span>
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>快捷键</b>
                    <span>搜得到、进得去、退得出。</span>
                  </div>
                </div>
                <div className="shortcut-list">
                  {[
                    ["聚焦搜索", "Ctrl K"],
                    ["关闭弹层 / 返回库", "Esc"],
                    ["切换详情页签", "1 – 4"],
                    ["收藏当前游戏", "F"],
                    ["封面墙 / 侧栏移动", "方向键"],
                    ["进入详情 / 启动", "Enter / Ctrl Enter"],
                  ].map(([k, v]) => (
                    <div className="shortcut" key={k}>
                      <span>{k}</span>
                      <kbd>{v}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setting-block">
                <div className="setting-row-head">
                  <div>
                    <b>技术栈</b>
                    <span>Tauri 2 · React 19 · Rust · SQLite。界面不联网，资料来自 Steam 公开接口。</span>
                  </div>
                </div>
                <div className="setting-hint">
                  开源许可与更新日志见仓库 README。成就定义 © Valve / 各游戏发行商，仅作本地展示。
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
