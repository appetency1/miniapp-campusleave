package com.campusleave.common;

import lombok.Data;

/**
 * 统一响应体（所有接口的返回都包这一层，对应 03_API §1.3）。
 *
 * <p>结构固定为四段：
 * <pre>
 * {
 *   "code": 0,              // 0 = 成功；非 0 = 业务错误（见 ErrorCode）
 *   "message": "ok",        // 提示文案
 *   "data": {...},          // 业务数据（可为 null）
 *   "traceId": "b7c1e2f0"   // 链路追踪 id，方便前端报障时定位是哪次请求
 * }
 * </pre>
 *
 * <p>为什么要统一：前端（小程序 + Web 后台）只需判断 code 是否为 0，
 * 不用关心 HTTP 状态码细节；错误提示统一从 message 取。异常由
 * GlobalExceptionHandler 兜底转成这个结构，业务代码只需 throw BizException。
 *
 * @param <T> 业务数据类型
 */
@Data
public class Result<T> {
    private int code;
    private String message;
    private T data;
    private String traceId;

    /** 成功（带数据） */
    public static <T> Result<T> ok(T data) {
        Result<T> r = new Result<>();
        r.code = 0;
        r.message = "ok";
        r.data = data;
        return r;
    }

    /** 成功（无数据） */
    public static <T> Result<T> ok() {
        return ok(null);
    }

    /** 失败（带数据，一般用于需要返回错误详情的场景） */
    public static <T> Result<T> fail(int code, String message, T data) {
        Result<T> r = new Result<>();
        r.code = code;
        r.message = message;
        r.data = data;
        return r;
    }

    /** 失败（无数据） */
    public static <T> Result<T> fail(int code, String message) {
        return fail(code, message, null);
    }
}
