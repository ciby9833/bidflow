/**
 * 文件：backend/src/shared/dto/response.dto.ts
 * 功能：统一后端接口响应结构，减少控制器重复拼装 success/data/meta/error。
 * 交互：被各 controller 返回结果时复用；前端 useApi.ts 与页面按该结构解析。
 * 作者：吴川
 */
export class ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta?: Record<string, unknown>;

  static ok<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
    return { success: true, data, error: null, meta };
  }

  static fail(code: string, messageKey: string, detail?: Record<string, unknown>, message?: string): ApiResponse<null> {
    return { success: false, data: null, error: { code, message_key: messageKey, message, detail } };
  }
}

export interface ApiError {
  code: string;
  message_key: string;
  /** 已用当前请求 locale 翻译好的文本，前端可直接展示，无需二次 t()。 */
  message?: string;
  detail?: Record<string, unknown>;
}
