import { useEffect, useState } from "react";
import { useSubsFeed } from "../../common/stores/subsFeed";
import { useChannels } from "../../common/stores/channels";
import Spinner, { ErrorBox } from "../../common/components/Spinner";
import Img from "../../common/components/Img";
import { AvatarBadge, RowCard } from "../components/VideoCards";
import { videoIdOf } from "../../common/lib/format";

/** 移动端订阅页：博主横滑岛 + 分组 chips + 订阅更新流（分组筛选复用桌面 selectedGroups 逻辑） */
export default function SubscriptionsView() {
  const { items, failed, status, error, selectedGroups, setSelectedGroups, load } = useSubsFeed();
  const channels = useChannels((s) => s.channels);
  const groups = useChannels((s) => s.groups);
  // 本地单选 chips 态："all" = 全部；其余为分组 key（含 "ungrouped"）
  const [chip, setChip] = useState("all");

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  useEffect(() => {
    if (chip === "all") {
      if (selectedGroups !== null) setSelectedGroups(null);
    } else if (selectedGroups?.length !== 1 || selectedGroups[0] !== chip) {
      setSelectedGroups([chip]);
    }
    // chip 变化即重拉（桌面端确认按钮触发，这里单选 chips 直达）
    if (status === "ready") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip]);

  const groupNameOf = (key: string) =>
    key === "ungrouped" ? "默认分组" : (groups.find((g) => g.id === key)?.name ?? key);

  return (
    <div>
      {/* 博主横滑岛（桌面右栏博主岛的移动形态；M3 接频道页跳转） */}
      {channels.length > 0 && (
        <div className="flex gap-3.5 overflow-x-auto border-b border-line bg-surface px-3.5 py-3">
          {channels.map((c) => (
            <div key={c.id} className="flex w-15 flex-col items-center gap-1.5">
              {c.thumb ? (
                <Img
                  src={c.thumb}
                  alt=""
                  className="h-13 w-13 shrink-0 rounded-full bg-flat object-cover"
                />
              ) : (
                <AvatarBadge name={c.title} size={52} />
              )}
              <span className="w-15 truncate text-center text-[10.5px] text-ink-2">
                {c.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 分组筛选 chips（单选直达，持久化经 selectedGroups） */}
      <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-3.5 py-2.5">
        {(
          [
            { key: "all", name: "全部" },
            { key: "ungrouped", name: "默认分组" },
            ...groups.map((g) => ({ key: g.id, name: g.name })),
          ] as Array<{ key: string; name: string }>
        ).map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setChip(g.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              chip === g.key ? "bg-accent/10 font-bold text-accent" : "bg-flat text-ink-2"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {failed.length > 0 && (
        <p className="bg-flat px-3.5 py-2 text-[11px] text-ink-3">
          {failed.length} 个频道更新拉取失败：{failed.slice(0, 3).join("、")}
          {failed.length > 3 ? " 等" : ""}
        </p>
      )}

      {status === "loading" || status === "idle" ? (
        <Spinner label="拉取订阅更新…" />
      ) : status === "error" ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <p className="p-6 text-sm text-ink-2">
          {chip === "all"
            ? "还没有订阅博主，去设置页或搜索页添加。"
            : `「${groupNameOf(chip)}」分组内暂无更新。`}
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((v, i) => (
            <RowCard key={videoIdOf(v) ?? i} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
