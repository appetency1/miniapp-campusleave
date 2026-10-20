package com.campusleave.security;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;

/**
 * 获取当前登录用户 / 校验角色。
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static LoginUser require() {
        LoginUser user = UserContext.get();
        if (user == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        return user;
    }

    public static LoginUser requireRole(String... roles) {
        LoginUser user = require();
        for (String r : roles) {
            if (r.equals(user.getRole())) {
                return user;
            }
        }
        throw new BizException(ErrorCode.FORBIDDEN);
    }

    public static Long requireUserId() {
        return require().getUserId();
    }
}
