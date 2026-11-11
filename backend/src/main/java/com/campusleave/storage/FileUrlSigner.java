package com.campusleave.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * 文件访问签名器（P0-3：/files/** 不能再匿名可读）。
 *
 * <p><b>要解决的问题</b>：诊断证明这类材料由 {@code StaticResourceConfig} 直接映射成
 * 静态资源，任何拿到路径的人（不需要登录）都能下载。但浏览器用
 * {@code <img src>} / {@code <a href>} 打开时<b>不会带 Authorization 头</b>，
 * 所以不能简单在 {@code /files/**} 上要求 JWT——那样管理端详情页的图片就全裂了。
 *
 * <p><b>做法</b>：签名 URL。后端返回给前端的 URL 形如
 * <pre>/files/2026/10/abc.png?exp=1760000000&amp;sig=Xy7...</pre>
 * 前端原样塞进 img/a 标签即可，不用改一行前端代码；访问时
 * {@link FileAccessFilter} 校验 exp 未过期且 sig 正确才放行。
 *
 * <p><b>为什么密钥复用 JWT secret</b>：项目只有一套密钥配置
 * （{@code campus-leave.jwt.secret}），再引一个配置项意味着部署时多一个
 * 必须同步的变量。HMAC 输入里带上 {@link #SIG_CONTEXT} 前缀做域分离，
 * 保证文件签名的密钥流与 JWT 签名流互不影响。
 *
 * <p><b>有效期 10 分钟</b>：足够一次详情页加载（含图片懒加载），
 * 又不至于让签好的链接被复制出去长期可用。过期后前端刷新页面即拿到新链接。
 */
@Component
public class FileUrlSigner {

    /** 域分离前缀：区分「文件签名」与「JWT 签名」两种用途 */
    private static final String SIG_CONTEXT = "campus-leave:file:";

    /** 签名有效期（秒）：10 分钟 */
    public static final long TTL_SECONDS = 600;

    private static final String HMAC_ALG = "HmacSHA256";

    private final byte[] keyBytes;

    public FileUrlSigner(@Value("${campus-leave.jwt.secret}") String secret) {
        this.keyBytes = secret.getBytes(StandardCharsets.UTF_8);
    }

    /**
     * 给相对路径签名，返回可直接给前端的 URL。
     *
     * <p>空值原样返回 null——材料可能没有附件，调用方不必逐处判空。
     *
     * @param path 形如 {@code /files/2026/10/uuid.png}
     * @return {@code path + "?exp=...&sig=..."}，入参为空时返回 null
     */
    public String sign(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        // 已经是带查询串的地址（理论上不该出现），直接返回，避免二次拼接出错
        if (path.contains("?")) {
            return path;
        }
        long exp = System.currentTimeMillis() / 1000 + TTL_SECONDS;
        String sig = hmac(path, exp);
        return path + "?exp=" + exp + "&sig=" + sig;
    }

    /**
     * 验签：exp 未过期 且 sig 匹配。
     *
     * <p>比较用 {@link MessageDigest#isEqual}（常量时间），避免通过响应时间差
     * 逐字节猜签名的计时攻击。
     *
     * @param path 请求路径（不含查询串，如 {@code /files/2026/10/uuid.png}）
     * @param exp  过期时间（unix 秒）
     * @param sig  客户端带来的签名
     * @return 校验通过返回 true
     */
    public boolean verify(String path, String exp, String sig) {
        if (path == null || path.isBlank() || exp == null || sig == null) {
            return false;
        }
        long expSeconds;
        try {
            expSeconds = Long.parseLong(exp);
        } catch (NumberFormatException e) {
            return false;
        }
        // 过期即拒（当前时间已经超过 exp）
        if (System.currentTimeMillis() / 1000 > expSeconds) {
            return false;
        }
        String expected = hmac(path, expSeconds);
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                sig.getBytes(StandardCharsets.UTF_8));
    }

    /** 计算 HMAC-SHA256，Base64 URL-safe 无填充编码（可直接放进 query 不用再转义） */
    private String hmac(String path, long exp) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALG);
            mac.init(new SecretKeySpec(keyBytes, HMAC_ALG));
            String payload = SIG_CONTEXT + path + "|" + exp;
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (Exception e) {
            // 算法固定存在、密钥固定非空，走到这里说明 JVM 环境异常，直接失败不放行
            throw new IllegalStateException("文件签名计算失败", e);
        }
    }
}
