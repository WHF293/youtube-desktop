import MobileNavBar from "../components/MobileNavBar";

/** 我的：M3 实现应用卡 + 数据概览 + 功能菜单聚合（占位为 M1 壳验证） */
export default function MeView() {
  return (
    <>
      <MobileNavBar title={<span>我的</span>} />
      <div className="m-placeholder">
        <b>我的</b>
        <span>M3 待实现：收藏/离线/博主分组/设置聚合入口</span>
      </div>
    </>
  );
}
