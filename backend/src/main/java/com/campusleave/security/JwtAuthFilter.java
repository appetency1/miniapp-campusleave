package com.campusleave.security;

import com.campusleave.common.ErrorCode;
import com.campusleave.common.TraceIdFilter;
import com.campusleave.domain.entity.User;
import com.campusleave.domain.mapper.UserMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * JWT 鉴权过滤器：从 Authorization 头解析登录用户，写入 UserContext（ThreadLocal）。
 *
 * <p>执行时机：每个 /api/** 请求到达 Controller 之前（在 WebConfig 里注册，order=2）。
 *
 * <p>不强制登录：无 token / token 无效时放行，由 CurrentUser.require() 在业务层决定是否拒绝。
 * 这样设计的好处：像登录、字典这类公开接口不需要 token，同一套过滤器即可覆盖，无需额外白名单。
 *
 * <p>为什么用 ThreadLocal 而不是 Spring Security 的 SecurityContext：
 * 本项目只做了「JWT 验签 + 角色判断」，不需要 Spring Security 那套完整的认证授权体系；
 * 引 spring-security-core 会多带一堆无关依赖。自定义 ThreadLocal 更轻、更可控，
 * 且 <b>每次请求结束在 finally 里 clear()，避免线程复用（Tomcat 线程池）导致用户串号</b>。
 *
 * <p><b>为什么验签之后还要查库</b>：JWT 是无状态的，签发后服务端无法主动吊销。
 * 如果只验签，管理员把账号停用（status=DISABLED）后，对方拿旧 token 还能继续用满 7 天 ——
 * 「停用」形同虚设。这里每次请求查一次主键（本地 MySQL < 1ms），拿库里的事实说话：
 * 账号不存在 → 40101；status 非 ACTIVE → 40103。
 * 同时角色也以库里为准，避免 token 里的 role 与库不一致（例如被降权后旧 token 仍是管理员）。
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserMapper userMapper;

    public JwtAuthFilter(JwtUtil jwtUtil, UserMapper userMapper) {
        this.jwtUtil = jwtUtil;
        this.userMapper = userMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // 标准格式：Authorization: Bearer <token>
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);   // 去掉 "Bearer " 前缀（7 个字符）
            try {
                var claims = jwtUtil.parse(token);
                Long userId = Long.valueOf(claims.getSubject());   // subject 存的是 userId

                User account = userMapper.selectById(userId);
                if (account == null) {
                    reject(response, ErrorCode.UNAUTHORIZED, "账号不存在");
                    return;
                }
                if (!"ACTIVE".equals(account.getStatus())) {
                    reject(response, ErrorCode.ACCOUNT_DISABLED, "账号已禁用");
                    return;
                }

                // 用户名与角色以库为准，不采信 token 里的旧值
                UserContext.set(LoginUser.of(userId, account.getUsername(), account.getRole()));
            } catch (Exception ignored) {
                // token 无效 / 被篡改 / 已过期：保持未登录状态，交给 CurrentUser.require() 返回 401
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            // 关键：请求结束后必须清空，避免 Tomcat 线程池复用同一线程时串号
            UserContext.clear();
        }
    }

    /** 直接写 JSON 拒绝，与其它接口同构（前端按 code 判断，不会拿到 HTML 解析失败） */
    private void reject(HttpServletResponse response, ErrorCode code, String message) throws IOException {
        response.setStatus(code.getHttpStatus().value());
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String traceId = TraceIdFilter.getTraceId();
        String body = "{\"code\":" + code.getCode()
                + ",\"message\":\"" + message + "\",\"data\":null"
                + ",\"traceId\":\"" + (traceId == null ? "" : traceId) + "\"}";
        response.getWriter().write(body);
    }
}
