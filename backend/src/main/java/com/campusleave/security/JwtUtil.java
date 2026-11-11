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

    /**
     * 仓库里曾经长期使用的公开占位密钥。
     *
     * <p>它出现在 {@code application-dev.yml.example} 里，随公开仓库一起分发，
     * 等于全世界都拿到了签名密钥——任何人可以用它自签 {@code role=ADMIN} 的令牌。
     * 这里保留常量只为了在启动时<b>拒绝</b>它，不是可用的默认值。
     */
    private static final String LEAKED_PLACEHOLDER = "campus-leave-jwt-secret-key-change-me-2026";

    /** HS256 要求密钥至少 256 bit（32 字节），不够长度 jjwt 会在签名时抛 WeakKeyException */
    private static final int MIN_SECRET_BYTES = 32;

    public JwtUtil(@Value("${campus-leave.jwt.secret:}") String secret,
                   @Value("${campus-leave.jwt.expire-seconds}") long expireSeconds) {
        validateSecret(secret);
        // HMAC 算法要求密钥是字节数组，这里把配置的字符串按 UTF-8 编码转成密钥
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireSeconds = expireSeconds;
    }

    /**
     * 启动即校验密钥（P0-2）。
     *
     * <p>三种情况一律让应用启动失败，而不是悄悄跑起来：
     * <ul>
     *   <li>没配（空 / 空白）——说明部署方漏了环境变量</li>
     *   <li>仍是仓库公开的占位串——等于没有密钥</li>
     *   <li>长度不足 32 字节——HS256 达不到安全强度</li>
     * </ul>
     *
     * <p><b>为什么选择「启动失败」而不是「自动生成随机密钥」</b>：自动生成会让
     * 每次重启后旧令牌全部失效，且多实例部署时互相验不过——问题会延后到线上才爆。
     * 启动即失败能在第一秒就把配置问题暴露给人，代价最小。
     *
     * @throws IllegalStateException 密钥不可用时抛出，Spring 启动中止
     */
    private static void validateSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT 密钥未配置：请设置环境变量 CAMPUS_JWT_SECRET，长度≥32 字节");
        }
        if (LEAKED_PLACEHOLDER.equals(secret.trim())) {
            throw new IllegalStateException(
                    "JWT 密钥仍是仓库公开的占位串，任何人都能伪造令牌："
                            + "请设置环境变量 CAMPUS_JWT_SECRET，长度≥32 字节");
        }
        int bytes = secret.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT 密钥长度不足（当前 " + bytes + " 字节，至少 " + MIN_SECRET_BYTES
                            + " 字节）：请设置环境变量 CAMPUS_JWT_SECRET，长度≥32 字节");
        }
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
