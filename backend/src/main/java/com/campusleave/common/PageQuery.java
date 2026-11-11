package com.campusleave.common;

/**
 * 分页参数夹取工具。
 *
 * <p><b>为什么需要</b>：Controller 上的 {@code page}/{@code size} 直接透传给
 * MyBatis-Plus 的 {@code Page}，之前没有任何上限——传 {@code size=100000}
 * 就能一次拉全表（等于没有分页），{@code page=0} 还会算出负数 offset。
 * 这两个都是「客户端一改参数就打穿服务端」的典型，属于
 * {@code reviews/security-perf-audit-2026-10-23.md} 里的 P0-5。
 *
 * <p><b>为什么不改接口契约</b>：03_API 里参数名与默认值（page=1 / size=20）
 * 保持不变，这里只在服务端入口做静默夹取。越界请求不报错，按边界值处理，
 * 这样既堵住了攻击面，又不会让现有前端和探针因为参数越界而突然 400。
 *
 * <p><b>上限取 100 的理由</b>：本项目最大的列表是全校申请记录，
 * 演示与造数数据量在百条量级；100 条足够翻页展示，又不至于被拿来当导出接口。
 */
public final class PageQuery {

    /** size 默认值（与 Controller 的 defaultValue 保持一致） */
    public static final int DEFAULT_SIZE = 20;

    /** size 上限：单次最多返回 100 条 */
    public static final int MAX_SIZE = 100;

    private PageQuery() {
    }

    /**
     * 页码夹取：小于 1 一律按 1 处理。
     *
     * @param page 原始页码（可能为 0 或负数）
     * @return 合法页码（≥ 1）
     */
    public static int clampPage(int page) {
        return page < 1 ? 1 : page;
    }

    /**
     * 每页条数夹取：夹到 [1, 100]。
     *
     * @param size 原始条数（可能超大、为 0 或负数）
     * @return 合法条数（1..100）
     */
    public static int clampSize(int size) {
        if (size < 1) return 1;
        return Math.min(size, MAX_SIZE);
    }
}
