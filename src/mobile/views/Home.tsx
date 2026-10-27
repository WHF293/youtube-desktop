import MobileNavBar from "../components/MobileNavBar";

/** 首页：M2 实现分类 chips + 单列视频流 + IntersectionObserver 上拉加载（占位为 M1 壳验证） */
export default function HomeView() {
  return (
    <>
      <MobileNavBar title={<span>首页</span>} />
      <div className="m-placeholder">
        <b>首页</b>
        <span>M2 待实现：分类 chips + 单列视频流 + 上拉加载</span>
      </div>
    </>
  );
}
