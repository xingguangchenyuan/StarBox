import { useState } from "react";
import { t } from "@/i18n/zh-CN";
import { Dialog } from "@/components/Dialog";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toasts";
import { api, isDemo } from "@/lib/api";
import { resetDemo } from "@/lib/demo";
import { IconFolder, IconKey, IconRefresh, IconScan } from "@/components/Icons";
import { TagManager } from "@/components/dialogs/TagManager";

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
  const [key, setKey] = useState("");
  const [steamId, setSteamId] = useState(settings?.steamId ?? "");
  const [syncingAll, setSyncingAll] = useState(false);

  const saveKey = async () => {
    const trimmed = key.trim();
    if (!trimmed && !steamId.trim()) return;
    await patchSettings({ ...(trimmed ? { steamApiKey: trimmed } : {}), steamId: steamId.trim() || null });
    setKey("");
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

  const section = (label: string) => <div className="section-label">{label}</div>;

  return (
    <Dialog
      title={t("settings.title")}
      subtitle={info?.version ? `v${info.version}` : undefined}
      onClose={close}
      wide
      footer={
        <>
          <span className="form-hint" style={{ marginTop: 0 }}>
            {settings?.hasApiKey ? "Steam Key 已加密保存" : "未填写 Steam Key"}
            {isDemo ? " · 浏览器预览模式" : ""}
          </span>
          <div className="spacer" />
          <button className="btn-secondary" onClick={close}>
            {t("common.close")}
          </button>
        </>
      }
    >
      {section(t("settings.steamKey"))}
      <div className="form-row">
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
            <span style={{ position: "absolute", left: 10, top: 9, color: "var(--text-3)" }}>
              <IconKey size={13} />
            </span>
            <input
              className="text-input"
              style={{ paddingLeft: 30 }}
              type="password"
              value={key}
              spellCheck={false}
              autoComplete="off"
              placeholder={settings?.hasApiKey ? "已保存 · 留空不改动" : t("settings.steamKeyPlaceholder")}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => void saveKey()} disabled={!key.trim() && !steamId.trim()}>
            {t("common.save")}
          </button>
          {settings?.hasApiKey && (
            <button className="chip" onClick={() => void clearKey()}>
              清除 Key
            </button>
          )}
        </div>
        <div className="form-hint">
          {t("settings.steamKeyHint")}
          <a
            href="https://steamcommunity.com/dev/apikey"
            style={{ color: "var(--hi)", marginLeft: 4 }}
            onClick={(e) => {
              e.preventDefault();
              void api.openUrl("https://steamcommunity.com/dev/apikey");
            }}
          >
            申请地址 →
          </a>
        </div>
      </div>

      <div className="form-row">
        <label className="field-label">{t("settings.steamId")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="text-input"
            style={{ flex: "1 1 auto", minWidth: 0 }}
            value={steamId}
            spellCheck={false}
            placeholder="7656119xxxxxxxxxx"
            onChange={(e) => setSteamId(e.target.value)}
            onBlur={() =>
              void patchSettings(
                steamId.trim() ? { steamId: steamId.trim() } : { clearSteamId: true },
              )
            }
          />
          <button className="chip" onClick={() => void detectId()}>
            读取本机
          </button>
        </div>
        <div className="form-hint">{t("settings.steamIdHint")}</div>
      </div>

      {section(t("settings.account"))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="chip"
          onClick={() => {
            close();
            open("scan");
          }}
        >
          <IconScan size={12} />
          {t("settings.scan")}
        </button>
        <button className="chip" onClick={() => void refreshAll()} disabled={refreshing}>
          <IconRefresh size={12} />
          {refreshing ? "刷新中…" : t("settings.refreshAll")}
        </button>
        <button className="chip" onClick={() => void syncAll()} disabled={syncingAll}>
          <IconRefresh size={12} />
          {syncingAll ? "同步中…" : "同步全部成就"}
        </button>
        <button className="chip" onClick={() => void openDataDir()}>
          <IconFolder size={12} />
          {t("settings.openDataDir")}
        </button>
      </div>
      <div className="form-hint" style={{ marginTop: 10 }}>
        商店资料（简介 / 分类 / 截图 / 封面）缓存在本地，断网也能看。成就定义需要 Key。
      </div>

      {section(t("settings.tags"))}
      <TagManager />

      {section(t("settings.appearance"))}
      <div className="kv-list">
        <div className="kv">
          <span className="k">{t("settings.cardSize")}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              className={`chip${settings?.cardSize !== "large" ? " is-on" : ""}`}
              style={{ height: 22, fontSize: 10.5 }}
              onClick={() => void patchSettings({ cardSize: "standard" })}
            >
              {t("settings.cardSizeGrid")}
            </button>
            <button
              className={`chip${settings?.cardSize === "large" ? " is-on" : ""}`}
              style={{ height: 22, fontSize: 10.5 }}
              onClick={() => void patchSettings({ cardSize: "large" })}
            >
              {t("settings.cardSizeWide")}
            </button>
          </div>
        </div>
        <div className="kv">
          <span className="k">{t("settings.reduceMotion")}</span>
          <button
            className={`switch${settings?.reduceMotion ? " is-on" : ""}`}
            style={{ marginLeft: "auto" }}
            onClick={() => void patchSettings({ reduceMotion: !settings?.reduceMotion })}
            role="switch"
            aria-checked={!!settings?.reduceMotion}
          />
        </div>
        <div className="kv">
          <span className="k">显示已隐藏的游戏</span>
          <button
            className={`switch${settings?.showHidden ? " is-on" : ""}`}
            style={{ marginLeft: "auto" }}
            onClick={() => void patchSettings({ showHidden: !settings?.showHidden })}
            role="switch"
            aria-checked={!!settings?.showHidden}
          />
        </div>
      </div>

      {section(t("settings.keyboard"))}
      <div className="kv-list">
        <div className="kv">
          <span className="k">搜索</span>
          <span className="v">Ctrl K</span>
        </div>
        <div className="kv">
          <span className="k">返回游戏库 / 关闭弹层</span>
          <span className="v">Esc</span>
        </div>
        <div className="kv">
          <span className="k">拖入 exe 或文件夹</span>
          <span className="v">直接入库</span>
        </div>
      </div>

      {section(t("settings.about"))}
      <div className="kv-list">
        <div className="kv">
          <span className="k">{t("settings.version")}</span>
          <span className="v">
            {info?.version ?? "0.1.0"} · {isDemo ? "浏览器预览" : "Tauri 桌面版"}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("settings.dataDir")}</span>
          <span className="v">{info?.dataDir ?? "—"}</span>
        </div>
        <div className="kv">
          <span className="k">{t("settings.storage")}</span>
          <span className="v">SQLite · {games.length} 条游戏记录</span>
        </div>
      </div>
      <div className="form-hint" style={{ marginTop: 10 }}>
        {t("settings.aboutText")}
      </div>

      {isDemo && (
        <div style={{ marginTop: 14 }}>
          <button
            className="chip"
            onClick={() => {
              resetDemo();
              void reload();
              toast.info(t("settings.resetDemo"), "演示数据已恢复初始状态");
            }}
          >
            <IconRefresh size={11} />
            {t("settings.resetDemo")}
          </button>
        </div>
      )}
    </Dialog>
  );
}
