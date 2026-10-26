import { Link } from "react-router-dom";
import Icon from "../components/Icon";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-1.5 text-sm leading-6 text-ink-2">{children}</div>
    </section>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** 使用说明页：软件怎么用、如何从 YouTube 导入订阅数据 */
export default function Help() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="book" size={20} />
        使用说明
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-2">
        本应用为纯客户端：数据走 YouTube 网页端 InnerTube 接口与频道 RSS，
        无配额限制、无需 API Key 和任何 Google 登录；所有数据（订阅、分组、收藏）只存在本机。
      </p>

      <Section title="订阅博主">
        <Step>
          进入 <b>设置 → 订阅频道管理</b>，粘贴博主的频道链接（youtube.com/@xxx）或 UC
          开头的频道 ID，点「添加」自动解析频道名。
        </Step>
        <Step>
          从 YouTube 导入：登录 youtube.com → takeout.google.com 只勾选「YouTube 和 YouTube
          Music」→ 导出订阅，解压后把 <code className="rounded bg-flat px-1">subscriptions.csv</code>
          文件拖进设置页的导入框（或直接粘贴 CSV 内容），一键导入全部博主。
        </Step>
        <Step>
          添加后到 <b>订阅</b> 页查看所有博主的最新视频聚合流；右侧「我的博主」可分组、可收起。
        </Step>
      </Section>

      <Section title="博主分组">
        <Step>
          订阅页右栏底部点「<b>博主分组</b>」（或设置页「博主列表」标题）进入分组看板。
        </Step>
        <Step>
          一个分组一列，<b>拖拽博主卡片到不同列</b>即完成归类；「+ 新建分组」添加分组；
          列头 ←/→ 调整分组顺序，✕ 删除分组（博主移回默认分组，不会丢失）。
        </Step>
      </Section>

      <Section title="收藏视频">
        <Step>
          视频播放页<b>观看次数左侧的五角星</b>：点击收藏（可选择收藏分组），再次点击管理或取消收藏。
        </Step>
        <Step>
          侧栏「<b>收藏</b>」页查看全部收藏视频，支持按收藏分组整理、移动与删除。
        </Step>
      </Section>

      <Section title="视频下载与离线观看">
        <Step>
          视频播放页<b>观看次数左侧的下载图标</b>：选择清晰度（144p~4K，标注单文件/需合流与预估大小）后开始下载。
        </Step>
        <Step>
          侧栏「<b>离线视频</b>」页分「正在下载」与「下载完成」两个模块；完成的视频点击即用本地播放器观看，无需联网。
        </Step>
        <Step>
          下载目录默认 <code className="rounded bg-flat px-1">C:/download/youtube</code>，可在设置页修改；
          1080p 及以上需 ffmpeg 合流（首次使用自动下载，或指定本地 ffmpeg）。
        </Step>
        <Step>
          下载失败会显示具体原因（网络/接口变更/ffmpeg 缺失等），点「重试」会重新提取流地址。
        </Step>
      </Section>

      <Section title="观看记录">
        <Step>
          侧栏「<b>观看记录</b>」按日期分组展示最近 7 天看过的视频：今天自动展开，更早的日期点击展开。
        </Step>
        <Step>
          记录保存在本机 SQLite 数据库，<b>每次打开应用自动清理 7 天前</b>的记录；重复观看同一视频只刷新时间。
        </Step>
      </Section>

      <Section title="地区与语言">
        <Step>
          侧栏底部「<b>地区</b>」：切换首页「全部」（地区频道组）与「新闻」分类（按地区搜索）的内容地区，
          并影响搜索结果的地区倾向，选择即生效。
        </Step>
        <Step>
          设置页「搜索内容语言」：多选后搜索会按各语言分别请求并交错合并结果。
        </Step>
      </Section>

      <Section title="字幕与播放">
        <Step>
          播放器自动开启字幕并<b>翻译为简体中文</b>：有原生中文字幕直接使用，没有则由 YouTube 自动翻译
          （AI 翻译可能有误差，可在播放器设置里切换）。
        </Step>
        <Step>
          播放页下滑、主播放器完全滚出视口时，视频自动收进<b>右下角小窗</b>继续播放；滑回顶部自动还原。
          小窗右上角 ✕ 可手动关闭。
        </Step>
        <Step>
          个别视频限制站外播放会黑屏，点播放器右上角按钮在系统浏览器中观看。
        </Step>
      </Section>

      <Section title="网络与播放">
        <Step>
          国内直连 YouTube 不可达，需在设置页配置代理（默认 127.0.0.1:7897）；数据与图片请求即时生效，
          <b>视频播放走 WebView 代理，修改代理后需重启应用</b>。
        </Step>
        <Step>
          个别视频限制站外播放会黑屏，点播放器右上角按钮在系统浏览器中观看。
        </Step>
      </Section>

      <Section title="网络要求提示">
        <Step>
          首页/订阅内容来自博主与频道组的 RSS 聚合；搜索、评论、相关视频与「新闻」分类走 InnerTube 接口。
          若某天数据异常，多半是 YouTube 调整了接口，保持应用更新即可。
        </Step>
      </Section>

      <p className="mt-8 text-xs text-ink-3">
        更多细节见项目文档 .ai/开发方案/ 目录。返回
        <Link to="/" className="mx-1 text-accent underline">首页</Link>。
      </p>
    </div>
  );
}
