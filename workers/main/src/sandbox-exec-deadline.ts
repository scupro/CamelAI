/**
 * sandbox 執行期限（sandbox exec deadline）—— Free Tier 佔位模組。
 *
 * Free Tier 已移除容器 / sandbox / R2 倉儲 / 程式碼執行綁定。本檔內容全是「純計時
 * 與純字串」邏輯（不碰容器、不碰 R2、不呼叫 Durable Object stub），因此原樣保留，
 * 讓仍參照本模組的 analysis-service.ts（`SANDBOX_EXEC_TIMEOUT_EVENT`、
 * `sandboxExecTimeoutMessage`）與 db-query-service.ts、project-build-service.ts
 * 能通過型別檢查並照常運作。
 *
 * 原始設計（保留供日後還原）：每一次 exec 類呼叫都會把 `timeout` 轉給容器，容器端
 * 是「主要」的執行期限，也是較好錯誤訊息的來源（它知道結束碼與部分輸出）。但 Worker
 * 這一端原本沒有上限：容器卡死、capnweb 呼叫懸置、或 shell 在命令下死掉，會讓呼叫端
 * 一路等到 PI_TURN_TOOL_HARD_TIMEOUT（20 分鐘）的後備機制。生產環境看過宣告
 * `timeoutMs: 120000` 的 `analysis_exec` 佔用了一整回合 1,200,000ms。
 *
 * 本模組提供「含寬限的上限」：它不取代容器端 timeout，只是拒絕無限期等待一個沒有
 * 成功触發的 timeout。在寬限窗口內，容器自己的錯誤仍然優先。
 *
 * ## 取消
 *
 * 原生容器（Sandbox SDK 1.0：ProjectBuildContainer、AnalysisContainer、
 * DbQueryContainer）把每條命令放在自己的程序裡、由 GNU `timeout` 執行，期限到了會
 * 殺掉整個程序群組。Worker 這邊沒有任何取消面：`exec()` 的 abort signal 只會
 * SIGKILL 直接子程序，而對已結束的程序送信會在 Durable Object 內部拋錯。因此被本
 * 期限放棄的命令，仍然由容器端的 `timeout` 收在範圍內。
 */

/**
 * 單一 await 動作的可取消期限；測試用替身換掉它，就能不用真實計時器驅動期限。
 * 建置就緒閘門（project-build-readiness.ts）的「逐次探測期限」也是同一形狀，共用此介面。
 */
export interface SandboxDeadlineTimer {
  promise: Promise<void>;
  cancel: () => void;
}

/** 以 setTimeout 實作的期限計時器。 */
export function createSandboxDeadlineTimer(ms: number): SandboxDeadlineTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    handle = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (handle !== undefined) clearTimeout(handle);
    },
  };
}

/** GNU `timeout` 在预算用盡時停掉命令所回報的結束碼。 */
export const SANDBOX_EXEC_TIMEOUT_EXIT_CODE = 124;

/** 低基數計數器：容器端因執行期限而殺掉命令。 */
export const SANDBOX_EXEC_TIMEOUT_EVENT = "sandbox_exec_timeout";

/**
 * 逾時 exec 所回報的錯誤文字。刻意與工具層長久以來顯示的容器端 timeout 訊息完全一致
 * （屬對外契約字串，故原字照抄），讓 agent 的處理方式與我們的日誌搜尋都不用改。
 */
export function sandboxExecTimeoutMessage(timeoutMs: number): string {
  return `Command timed out after ${timeoutMs}ms`;
}

/**
 * 在作業自身預算之外的寬限，用来 marshalling 一個「容器自己正常 timeout」的結果。
 * 大小讓容器端錯誤（附帶結束碼與輸出）在close race 中仍勝出。
 */
export const SANDBOX_EXEC_DEADLINE_GRACE_MS = 15_000;

/**
 * 「我們停止等待」的專屬失敗原因，絕不用於「命令失敗」。
 *
 * 訊息比照 PI_TURN_TOOL_TIMEOUT_MESSAGE 的語氣：說明預算、告訴 agent 縮小工作範圍、
 * 並明確表示回合仍然存活。
 *
 * `started: false` 是「預算已耗盡而拒絕派工」——我們從未派出，所以 agent 可以自由重試。
 * `started: true` 代表工作「確實已派出」，而我們沒有取消面（見檔頭說明）：命令可能已經
 * 跑完，其副作用也可能仍在落地，所以必須告誡 agent 不要盲目重試非冪等操作。
 */
export class SandboxDeadlineExceededError extends Error {
  readonly operation: string;
  readonly declaredTimeoutMs: number | undefined;
  readonly budgetMs: number;
  readonly waitedMs: number;
  /** 預算早就用完、我們拒絕派工時為 false。 */
  readonly started: boolean;

  constructor(input: {
    operation: string;
    declaredTimeoutMs: number | undefined;
    budgetMs: number;
    waitedMs: number;
    started?: boolean;
  }) {
    const started = input.started !== false;
    super(
      `${input.operation} did not return within its ${Math.round(input.budgetMs / 1000)}s budget ` +
      `(declared timeout ${input.declaredTimeoutMs == null ? "default" : `${input.declaredTimeoutMs}ms`}) ` +
      (started
        ? `and was abandoned. It may already have run to completion in the sandbox — file writes, ` +
          `installs and database changes it started can still be landing — so do NOT simply repeat it ` +
          `unless it is safe to run twice; check the resulting state first. `
        : `and was NOT started: the budget for this tool call was already spent. Nothing ran. `) +
      `Try a smaller scope, a shorter command, or a different approach — the turn is still active.`,
    );
    this.name = "SandboxDeadlineExceededError";
    this.operation = input.operation;
    this.declaredTimeoutMs = input.declaredTimeoutMs;
    this.budgetMs = input.budgetMs;
    this.waitedMs = input.waitedMs;
    this.started = started;
  }
}

/** 是否為「期限已過」錯誤（跨 RPC 跳轉後只剩 name/message 還在，故也比 name）。 */
export function isSandboxDeadlineExceededError(error: unknown): boolean {
  if (error instanceof SandboxDeadlineExceededError) return true;
  // Survives an RPC hop, where only name/message are preserved.
  return error instanceof Error && error.name === "SandboxDeadlineExceededError";
}

/** 與 analysis-service 在把 timeout 轉給容器前所用的同一個鉗位。 */
export function clampSandboxTimeoutMs(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export interface SandboxDeadlineExceededEvent {
  operation: string;
  declaredTimeoutMs: number | undefined;
  budgetMs: number;
  waitedMs: number;
  /** 預算已耗盡、我們拒絕派工時為 false。 */
  started?: boolean;
}

/**
 * 值得把_work_ 派進去的最低預算切片。
 *
 * 低於此值時 `run` 拒絕啟動，而不是派出一條幾毫秒後就會被我們放棄的命令。這很要緊，
 * 因為完全沒有取消面（見檔頭）：一個 1ms 的切片過去會把真實的 `bun install &&
 * bun run build` 送進共用的專案工作目錄然後撒手不問，讓重試階梯把好幾條疊在一起。
 */
export const SANDBOX_EXEC_DEADLINE_MIN_SLICE_MS = 1_000;

export interface SandboxExecDeadlineOptions {
  /** 低基數作業名稱；用於錯誤、日誌與 telemetry。 */
  operation: string;
  /** agent 宣告的 timeout，未鉗位且不可信任。 */
  declaredTimeoutMs?: number | undefined;
  /** 沒宣告時該作業類的預設值（既有repo常數）。 */
  defaultTimeoutMs: number;
  /** 該作業類的上限（既有repo常數）。 */
  maxTimeoutMs: number;
  /**
   * 該作業合理花在「被計時的命令之外」的墙上時間：把來源樹 materialize 進來、把
   * 變更集 persist 回儲存、固定的輔助命令。少了它，期限會砍短declared timeout 從
   * 來不打算涵蓋的工作。
   */
  overheadMs?: number;
  graceMs?: number;
  onExceeded?: (event: SandboxDeadlineExceededEvent) => void;
  /** 測試替身。 */
  now?: () => number;
  timer?: (ms: number) => SandboxDeadlineTimer;
}

export interface SandboxExecDeadline {
  /** 本期限在各次 `run` 呼叫之間總共允許的墙上時間。 */
  readonly budgetMs: number;
  /** 留給後續 `run` 呼叫的預算；第一次之前等於整個預算。 */
  readonly remainingMs: number;
  /**
   * 預算耗盡後為 true。帶有重試階梯的呼叫端必須視為終止狀態：之後每一次 `run` 都
   * 拒絕派工。
   */
  readonly exhausted: boolean;
  /**
   * 在「剩餘預算」下執行 `fn`。預算計時從第一次呼叫開始，並由各次呼叫共用，所以
   * 同一個工具呼叫周圍的重試階梯無法把等待時間乘以嘗試次數。
   *
   * 剩餘低於 SANDBOX_EXEC_DEADLINE_MIN_SLICE_MS 時拒絕派工（拋出 `started: false`
   * 的 `SandboxDeadlineExceededError`），因為被放棄的命令無法取消。
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * 在預算「之外」執行 `fn`：期限順著它實際花掉的時間往後挪。用於 exec 預算從來不
   * 打算涵蓋的墙上時間——等冷容器啟動、重試階梯的 backoff 睡眠——否則它們會默默
   * 吃掉命令自己的時間。被排除的工作本身必須自帶上限（就緒閘門與階梯都有），不然
   * 總墙上時間就失去上限了。
   */
  excluding<T>(fn: () => Promise<T>): Promise<T>;
}

/** 建立一個跨多次 `run` 共用、含寬限的執行期限。 */
export function createSandboxExecDeadline(
  options: SandboxExecDeadlineOptions,
): SandboxExecDeadline {
  const now = options.now ?? (() => Date.now());
  const timer = options.timer ?? createSandboxDeadlineTimer;
  const declaredTimeoutMs =
    typeof options.declaredTimeoutMs === "number" && Number.isFinite(options.declaredTimeoutMs)
      ? options.declaredTimeoutMs
      : undefined;
  const budgetMs =
    clampSandboxTimeoutMs(declaredTimeoutMs, options.defaultTimeoutMs, options.maxTimeoutMs) +
    (options.overheadMs ?? 0) +
    (options.graceMs ?? SANDBOX_EXEC_DEADLINE_GRACE_MS);
  let deadlineAtMs: number | null = null;
  let exhausted = false;
  // 小於下限的預算（只有測試用的超小預算才会走到）仍要拿到一次真實嘗試。
  const minSliceMs = Math.min(SANDBOX_EXEC_DEADLINE_MIN_SLICE_MS, budgetMs);

  return {
    budgetMs,
    get remainingMs(): number {
      if (deadlineAtMs === null) return budgetMs;
      return Math.max(0, deadlineAtMs - now());
    },
    get exhausted(): boolean {
      return exhausted;
    },
    async excluding<T>(fn: () => Promise<T>): Promise<T> {
      const startedAtMs = now();
      try {
        return await fn();
      } finally {
        // 第一次 `run` 之前沒有時計可推；預算是在第一條命令真的派出時才完整起算。
        if (deadlineAtMs !== null) deadlineAtMs += Math.max(0, now() - startedAtMs);
      }
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      deadlineAtMs ??= now() + budgetMs;
      const startedAtMs = now();
      const remainingMs = deadlineAtMs - startedAtMs;
      if (exhausted || remainingMs < minSliceMs) {
        // 絕不呼叫 `fn`：我們没法取消它啟動的東西，所以派一個不足切片的工會把真實
        // 命令留在共用工作目錄裡，而沒有人 await 它。
        const event: SandboxDeadlineExceededEvent = {
          operation: options.operation,
          declaredTimeoutMs,
          budgetMs,
          waitedMs: 0,
          started: false,
        };
        // 每個期限只記錄一次 telemetry：重試階梯反覆進入已耗盡的預算不得把指標
        // 加倍，或污染其 duration 直方圖。
        if (!exhausted) {
          exhausted = true;
          options.onExceeded?.(event);
        }
        throw new SandboxDeadlineExceededError(event);
      }
      const deadline = timer(remainingMs);
      try {
        const work = Promise.resolve().then(fn);
        // 被放棄的 promise 必須保持「已被人看」：workerd 會把沒有人 await 的 promise
        // 之後的 rejection 報成 unhandled rejection，讓 vitest 的嚴格預設失敗。
        work.catch(() => {});
        const outcome = await Promise.race([
          work.then((value) => ({ kind: "value" as const, value })),
          deadline.promise.then(() => ({ kind: "deadline" as const })),
        ]);
        if (outcome.kind === "value") return outcome.value;
        const event: SandboxDeadlineExceededEvent = {
          operation: options.operation,
          declaredTimeoutMs,
          budgetMs,
          waitedMs: Math.max(0, now() - startedAtMs),
          started: true,
        };
        exhausted = true;
        options.onExceeded?.(event);
        throw new SandboxDeadlineExceededError(event);
      } finally {
        deadline.cancel();
      }
    },
  };
}
