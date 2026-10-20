package com.campusleave.security;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;

/**
 * 获取当前登录用户 / 校验角色。
 *
 * <p>这是业务层拿登录用户信息的<b>唯一入口</b>，三个方法用途不同：
 * <ul>
 *   <li>{@link #require()}：必须已登录，否则抛 401（未登录/token 无效）</li>
 *   <li>{@link #requireRole(String...)}：必须已登录且角色匹配，否则抛 401 / 403</li>
 *   <li>{@link #requireUserId()}：只取当前用户 id，用于「仅本人可见」的数据范围过滤</li>
 * </ul>
 *
 * <p>对应 03_API §1.7 权限矩阵：学生只能操作自己的申请，教师只能操作负责班级，
 * 管理员管基础数据。Controller 调用 requireRole 做角色门禁，再在 Service 里做数据范围校验。
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    /**
     * 要求已登录。
     *
     * @throws BizException 401 若未登录（UserContext 里没有用户）
     */
    public static LoginUser require() {
        LoginUser user = UserContext.get();
        if (user == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        return user;
    }

    /**
     * 要求已登录且角色在允许列表内。
     *
     * @param roles 允许的角色（如 "STUDENT"、"TEACHER"、"ADMIN"）
     * @throws BizException 401 未登录 / 403 角色不符
     */
    public static LoginUser requireRole(String... roles) {
        LoginUser user = require();
        for (String r : roles) {
            if (r.equals(user.getRole())) {
                return user;
            }
        }
        throw new BizException(ErrorCode.FORBIDDEN);
    }

    /**
     * 获取当前登录用户的 id（要求已登录）。
     * 常用于「学生只能查自己的申请」这类本人数据范围过滤。
     */
    public static Long requireUserId() {
        return require().getUserId();
    }
}
