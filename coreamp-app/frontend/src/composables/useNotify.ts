import { useNotifyStore, errorMessage } from "@/stores/notify";

// Component-side helper: run an async op, reporting failures (and optionally a
// success message) through the global notification host. Returns the result, or
// undefined if it threw, so callers never deal with an unhandled rejection.
export function useNotify() {
  const notify = useNotifyStore();

  async function run<T>(
    fn: () => Promise<T>,
    opts: { errorPrefix?: string; success?: string } = {},
  ): Promise<T | undefined> {
    try {
      const result = await fn();
      if (opts.success) notify.success(opts.success);
      return result;
    } catch (err) {
      const prefix = opts.errorPrefix ? `${opts.errorPrefix}: ` : "";
      notify.error(`${prefix}${errorMessage(err)}`);
      return undefined;
    }
  }

  return { notify, run };
}
