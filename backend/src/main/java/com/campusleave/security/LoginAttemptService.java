package com.campusleave.security;

import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 登录失败限流（单机内存实现，不引 Redis）。
 *
 * <p>规则：同一来源在 5 分钟窗口内失败 {@value #MAX_FAILURES} 次 → 锁定 5 分钟，返回 40105。
 * 成功登录立即清零。
 *
 * <p><b>阈值为什么这么宽</b>：演示和调试时会反复试错，锁太紧反而坑自己。
 * 真正的价值是挡住脚本撞库 —— 10 次/5 分钟已经让在线爆破失去意义。
 *
 * <p><b>为什么放内存</b>：单机部署，重启即清空，不需要额外中间件；
 * 多实例部署时要换成 Redis 或数据库计数（当前架构不会出现）。
 */
@Component
public class LoginAttemptService {

    private static final int MAX_FAILURES = 10;
    private static final Duration WINDOW = Duration.ofMinutes(5);

    private static final class Bucket {
        final AtomicInteger failures = new AtomicInteger();
        volatile Instant firstAt = Instant.now();
        volatile Instant lockedUntil = null;
    }

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /** 已锁定则直接拒绝；锁定期过了就清空重来 */
    public void check(String key) {
        Bucket b = buckets.get(key);
        if (b == null || b.lockedUntil == null) {
            return;
        }
        if (Instant.now().isBefore(b.lockedUntil)) {
            throw new BizException(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS);
        }
        buckets.remove(key);
    }

    /** 记一次失败；跨窗口则重新计数 */
    public void fail(String key) {
        Bucket b = buckets.computeIfAbsent(key, k -> new Bucket());
        synchronized (b) {
            Instant now = Instant.now();
            if (Duration.between(b.firstAt, now).compareTo(WINDOW) > 0) {
                b.firstAt = now;
                b.failures.set(0);
            }
            if (b.failures.incrementAndGet() >= MAX_FAILURES) {
                b.lockedUntil = now.plus(WINDOW);
            }
        }
    }

    /** 登录成功：立刻清零，避免"之前失败过几次"影响后续 */
    public void success(String key) {
        buckets.remove(key);
    }
}
