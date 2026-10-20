package com.campusleave.security;

import lombok.Data;

/**
 * 当前登录用户上下文（从 JWT 解析）。
 */
@Data
public class LoginUser {
    private Long userId;
    private String username;
    private String role;

    public static LoginUser of(Long userId, String username, String role) {
        LoginUser u = new LoginUser();
        u.userId = userId;
        u.username = username;
        u.role = role;
        return u;
    }
}
