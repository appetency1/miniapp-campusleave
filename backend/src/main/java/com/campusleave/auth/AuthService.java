package com.campusleave.auth;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.User;
import com.campusleave.domain.mapper.UserMapper;
import com.campusleave.security.JwtUtil;
import com.campusleave.security.LoginUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 认证服务：负责登录、获取当前用户信息。
 *
 * <p>登录流程（对应 03_API §3.1）：
 * <ol>
 *   <li>按 username 查用户（username 全局唯一，学号/工号/管理员账号）</li>
 *   <li>用 BCrypt 校验密码（数据库只存哈希，不存明文，也绝不返回 password_hash）</li>
 *   <li>校验账号状态（DISABLED 则拒绝）</li>
 *   <li>签发 JWT，返回给前端</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor   // Lombok：自动生成包含所有 final 字段的构造器，用于依赖注入
public class AuthService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;  // BCrypt 密码编码器（见 SecurityBeanConfig）
    private final JwtUtil jwtUtil;

    /**
     * 登录。
     *
     * @param req 含 username + password
     * @return token、有效期、用户基本信息
     */
    public Map<String, Object> login(LoginRequest req) {
        // 按 username 查唯一用户
        User user = userMapper.selectOne(
                Wrappers.<User>lambdaQuery().eq(User::getUsername, req.getUsername()));

        // 安全考虑：用户不存在和密码错误返回同一个错误码，避免被枚举探测账号是否存在
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new BizException(ErrorCode.BAD_CREDENTIALS);
        }
        // 账号被禁用（DISABLED 状态，管理员在后台禁用）
        if ("DISABLED".equals(user.getStatus())) {
            throw new BizException(ErrorCode.ACCOUNT_DISABLED);
        }

        // 更新最近登录时间
        user.setLastLoginAt(LocalDateTime.now());
        userMapper.updateById(user);

        // 签发 JWT（无状态登录凭证，见 JwtUtil 注释）
        String token = jwtUtil.generate(user.getId(), user.getUsername(), user.getRole());

        // 组装响应数据（与 03_API §3.1 约定一致）
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("expiresIn", 604800);   // 7 天（秒），与配置 expire-seconds 一致
        Map<String, Object> u = new HashMap<>();
        u.put("id", user.getId());
        u.put("username", user.getUsername());
        u.put("role", user.getRole());
        u.put("realName", user.getRealName());
        data.put("user", u);
        return data;
    }

    /**
     * 获取当前登录用户信息（对应 03_API §3.2）。
     *
     * @param current 由 JwtAuthFilter 从 token 解析出的登录用户（见 CurrentUser.require）
     */
    public Map<String, Object> me(LoginUser current) {
        // 用 token 里的 userId 重新查一次数据库，拿到最新的用户资料（而非 token 里的快照）
        User user = userMapper.selectById(current.getUserId());
        if (user == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        data.put("username", user.getUsername());
        data.put("role", user.getRole());
        data.put("realName", user.getRealName());
        data.put("phone", user.getPhone());
        data.put("avatar", user.getAvatar());
        return data;
    }
}
