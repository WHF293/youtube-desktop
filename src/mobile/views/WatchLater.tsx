import MobileNavBar from "../components/MobileNavBar";

/** 待看：M3 实现行卡流 + 移除二次确认（占位为 M1 壳验证） */
export default function WatchLaterView() {
  return (
    <>
      <MobileNavBar title={<span>待看</span>} />
      <div className="m-placeholder">
        <b>待看</b>
        <span>M3 待实现：行卡流 + 移除二次确认</span>
      </div>
    </>
  );
}
