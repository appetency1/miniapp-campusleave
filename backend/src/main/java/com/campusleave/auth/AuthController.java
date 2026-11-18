package com.campusleave.auth;

import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        return Result.ok(authService.login(req));
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
}
