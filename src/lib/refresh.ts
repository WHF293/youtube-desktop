/**
 * 页面级刷新注册表：各页面挂载时注册自己的刷新动作，
 * 右下角刷新固钉（InfoPin）按当前路径调用。
 * 页面卸载自动解绑，未注册的路径不显示固钉。
 */

const registry = new Map<string, () => unknown>();

/** 页面挂载时注册，返回解绑函数（useEffect cleanup 用） */
export function registerPageRefresh(path: string, fn: () => unknown): () => void {
  registry.set(path, fn);
  return () => {
    if (registry.get(path) === fn) registry.delete(path);
  };
}

/** 执行某路径的刷新动作，返回该路径是否已注册 */
export function runPageRefresh(path: string): boolean {
  const fn = registry.get(path);
  if (!fn) return false;
  void fn();
  return true;
}
