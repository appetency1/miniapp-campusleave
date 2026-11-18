package com.campusleave.auth;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import com.campusleave.security.LoginAttemptService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginAttemptService loginAttempts;

    /**
     * 登录。
     *
     * <p>加了同源失败限流（10 次 / 5 分钟 → 40105），挡脚本撞库。
     * 只把「凭据错误」计入失败 —— 参数格式错（40001）不该累加，
     * 否则前端表单抖动几次就把老师锁在门外。
     */
    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        String ip = clientIp(http);
        loginAttempts.check(ip);
        try {
            Map<String, Object> data = authService.login(req);
            loginAttempts.success(ip);
            return Result.ok(data);
        } catch (BizException e) {
            if (e.getErrorCode() == ErrorCode.BAD_CREDENTIALS) {
                loginAttempts.fail(ip);
            }
            throw e;
        }
    }

    @GetMapping("/me")
    public Result<Map<String, Object>> me() {
        return Result.ok(authService.me(CurrentUser.require()));
    }

    @PostMapping("/logout")
    public Result<Void> logout() {
        // JWT 无状态，退出由前端清 token；此处仅保留接口位
        return Result.ok();
    }

    /** 修改自己的密码（03 §3.3） */
    @PutMapping("/password")
    public Result<Void> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        authService.changePassword(CurrentUser.require(), req.getOldPassword(), req.getNewPassword());
        return Result.ok();
    }

    /** 取真实客户端 IP：直连用 remoteAddr，反代场景取 X-Forwarded-For 首段 */
    private String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int i = xff.indexOf(',');
            return (i > 0 ? xff.substring(0, i) : xff).trim();
        }
        return req.getRemoteAddr();
    }
}
