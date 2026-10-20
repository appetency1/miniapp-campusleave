package com.campusleave.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

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
