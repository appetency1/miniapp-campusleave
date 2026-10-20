package com.campusleave.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 业务错误码。code 与 HTTP 状态码同时使用。
 */
@Getter
public enum ErrorCode {

    SUCCESS(0, HttpStatus.OK, "成功"),

    BAD_PARAM(40001, HttpStatus.BAD_REQUEST, "参数缺失或格式错误"),
    TIME_INVALID(40002, HttpStatus.BAD_REQUEST, "时间格式错误或结束时间不晚于开始时间"),

    UNAUTHORIZED(40101, HttpStatus.UNAUTHORIZED, "未登录或 token 无效"),
    TOKEN_EXPIRED(40102, HttpStatus.UNAUTHORIZED, "token 已过期"),
    ACCOUNT_DISABLED(40103, HttpStatus.UNAUTHORIZED, "账号已禁用"),
    BAD_CREDENTIALS(40104, HttpStatus.UNAUTHORIZED, "用户名或密码错误"),

    FORBIDDEN(40301, HttpStatus.FORBIDDEN, "越权访问"),

    NOT_FOUND(40401, HttpStatus.NOT_FOUND, "资源不存在"),

    STATUS_CONFLICT(40901, HttpStatus.CONFLICT, "状态冲突，请刷新后重试"),
    EXTENSION_EXISTS(40902, HttpStatus.CONFLICT, "已存在待审批续假"),
    TIME_OVERLAP(40903, HttpStatus.CONFLICT, "时间与已有有效申请重叠"),
    DUPLICATE_SUBMIT(40904, HttpStatus.CONFLICT, "重复提交"),

    ACTION_NOT_ALLOWED(42201, HttpStatus.UNPROCESSABLE_ENTITY, "当前状态不允许该操作"),
    LOCATION_OUT_OF_RANGE(42202, HttpStatus.UNPROCESSABLE_ENTITY, "定位距离超出允许范围"),
    CHECKIN_NOT_PROCESSABLE(42203, HttpStatus.UNPROCESSABLE_ENTITY, "核验记录不可处理"),
    NO_COUNSELOR(42204, HttpStatus.UNPROCESSABLE_ENTITY, "班级未配置辅导员"),

    INTERNAL_ERROR(50000, HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误");

    private final int code;
    private final HttpStatus httpStatus;
    private final String defaultMessage;

    ErrorCode(int code, HttpStatus httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }
}
