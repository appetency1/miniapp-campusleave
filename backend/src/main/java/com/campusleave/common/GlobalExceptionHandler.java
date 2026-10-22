package com.campusleave.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 路径不存在 → 404。
     *
     * <p>不处理的话会被下面的 {@code Exception} 兜底捕获成 500「服务器内部错误」，
     * 前端看到 500 会以为是后端崩了，排查时白找半天（这是实际踩过的坑）。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Result<Object>> handleNoResource(NoResourceFoundException e) {
        Result<Object> r = Result.fail(ErrorCode.NOT_FOUND.getCode(), "接口不存在：" + e.getResourcePath());
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(ErrorCode.NOT_FOUND.getHttpStatus()).body(r);
    }

    /**
     * 数据库约束违反 → 400。
     *
     * <p>典型场景：Service 层漏了枚举校验，脏值被 DB 的 CHECK 挡下（如 leave_scene='HACK'）。
     * 这类错误的成因在请求参数，不该报「服务器内部错误」。
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Result<Object>> handleDataIntegrity(DataIntegrityViolationException e) {
        log.warn("data integrity violation: {}", e.getMostSpecificCause().getMessage());
        Result<Object> r = Result.fail(ErrorCode.BAD_PARAM.getCode(), "数据不符合约束，请检查提交内容");
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(ErrorCode.BAD_PARAM.getHttpStatus()).body(r);
    }

    /** 请求体不是合法 JSON / 参数类型不匹配 → 400（而不是 500） */
    @ExceptionHandler({HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<Result<Object>> handleBadRequest(Exception e) {
        Result<Object> r = Result.fail(ErrorCode.BAD_PARAM.getCode(), "请求参数格式不正确");
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(ErrorCode.BAD_PARAM.getHttpStatus()).body(r);
    }

    @ExceptionHandler(BizException.class)
    public ResponseEntity<Result<Object>> handleBiz(BizException e) {
        Result<Object> r = Result.fail(e.getErrorCode().getCode(), e.getMessage(), e.getData());
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(e.getErrorCode().getHttpStatus()).body(r);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Result<Object>> handleValidation(MethodArgumentNotValidException e) {
        String msg = "参数错误";
        FieldError fe = e.getBindingResult().getFieldError();
        if (fe != null) {
            msg = fe.getField() + ": " + fe.getDefaultMessage();
        }
        Result<Object> r = Result.fail(ErrorCode.BAD_PARAM.getCode(), msg);
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(ErrorCode.BAD_PARAM.getHttpStatus()).body(r);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<Object>> handleOther(Exception e) {
        log.error("unexpected error", e);
        Result<Object> r = Result.fail(ErrorCode.INTERNAL_ERROR.getCode(), ErrorCode.INTERNAL_ERROR.getDefaultMessage());
        r.setTraceId(TraceIdFilter.getTraceId());
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.getHttpStatus()).body(r);
    }
}
