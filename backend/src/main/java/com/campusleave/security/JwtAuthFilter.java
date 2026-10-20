package com.campusleave.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

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
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    public JwtAuthFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // 标准格式：Authorization: Bearer <token>
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);   // 去掉 "Bearer " 前缀（7 个字符）
            try {
                // 验签 + 解析出用户信息
                var claims = jwtUtil.parse(token);
                Long userId = Long.valueOf(claims.getSubject());   // subject 存的是 userId
                String username = claims.get("username", String.class);
                String role = claims.get("role", String.class);
                // 存入当前线程的 ThreadLocal，后续 Controller/Service 通过 CurrentUser 读取
                UserContext.set(LoginUser.of(userId, username, role));
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
}
