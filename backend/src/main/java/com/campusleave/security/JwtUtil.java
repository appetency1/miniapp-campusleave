package com.campusleave.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 令牌工具类。
 *
 * <p>JWT（JSON Web Token）是一种无状态（stateless）的登录凭证：
 * 服务端登录时把用户信息打包成一个签名过的字符串发给客户端，
 * 客户端之后每次请求都带着它（放在 Authorization 头），
 * 服务端用密钥验签即可还原用户身份，<b>不需要在服务端存会话</b>。
 *
 * <p>结构：三段，用点号分隔 —— header.payload.signature
 * <ul>
 *   <li>header：声明签名算法（这里用 HS256，即 HMAC-SHA256）</li>
 *   <li>payload：业务字段，我们放了 userId（subject）、username、role、签发时间、过期时间</li>
 *   <li>signature：用密钥对前两段算出的签名，防篡改（改任何一段都会验签失败）</li>
 * </ul>
 *
 * <p>为什么适合本项目：小程序 + Web 后台共用一套 API，JWT 天然支持多端；
 * 毕业设计简化，不做 refresh token，过期时间定为 7 天（配置项 expire-seconds）。
 *
 * <p>安全要点：secret 必须足够长（HS256 要求 ≥ 256 bit / 32 字节），
 * 生产环境应从环境变量注入，不能硬编码进仓库。
 */
@Component
public class JwtUtil {

    /** 签名密钥（从配置 campus-leave.jwt.secret 读取后转成 SecretKey 对象） */
    private final SecretKey key;

    /** token 有效期（秒），来自配置 campus-leave.jwt.expire-seconds */
    private final long expireSeconds;

    public JwtUtil(@Value("${campus-leave.jwt.secret}") String secret,
                   @Value("${campus-leave.jwt.expire-seconds}") long expireSeconds) {
        // HMAC 算法要求密钥是字节数组，这里把配置的字符串按 UTF-8 编码转成密钥
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireSeconds = expireSeconds;
    }

    /**
     * 生成 token。
     *
     * @param userId   用户主键（放入 subject，是 token 的唯一主体标识）
     * @param username 登录账号（自定义字段）
     * @param role     角色 STUDENT / TEACHER / ADMIN（自定义字段，鉴权时用）
     */
    public String generate(Long userId, String username, String role) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expireSeconds * 1000);
        return Jwts.builder()
                .subject(String.valueOf(userId))   // 主体 = 用户 id
                .claim("username", username)        // 自定义字段：账号
                .claim("role", role)                // 自定义字段：角色
                .issuedAt(now)                      // 签发时间
                .expiration(exp)                    // 过期时间
                .signWith(key)                      // 用密钥签名（HS256）
                .compact();                         // 序列化成字符串
    }

    /**
     * 解析并验签 token。
     *
     * @return 解析出的 payload（Claims），可从中取 subject / username / role
     * @throws io.jsonwebtoken.JwtException 若 token 无效、被篡改或已过期（由调用方捕获处理）
     */
    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)          // 用同一密钥验签
                .build()
                .parseSignedClaims(token) // 验签 + 解析
                .getPayload();            // 取 payload 部分
    }
}
