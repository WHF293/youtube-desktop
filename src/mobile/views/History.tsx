import MobileNavBar from "../components/MobileNavBar";

/** 历史：M3 实现按日分组 + 行内快捷收藏/待看（占位为 M1 壳验证） */
export default function HistoryView() {
  return (
    <>
      <MobileNavBar title={<span>历史</span>} />
      <div className="m-placeholder">
        <b>历史</b>
        <span>M3 待实现：按日分组（sticky 吸顶）+ 快捷收藏/待看</span>
      </div>
    </>
  );
}
