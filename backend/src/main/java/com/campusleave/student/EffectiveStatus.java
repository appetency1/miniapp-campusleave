package com.campusleave.student;

import com.campusleave.domain.entity.LeaveApplication;

import java.time.LocalDateTime;

/**
 * 申请状态的「计算展示态」计算器（01_业务规则 §4.1）。
 *
 * <p><b>这是本系统状态设计的关键，答辩必问</b>：
 * 数据库只存 6 个持久状态（PENDING / APPROVED / REJECTED / WITHDRAWN / CANCELLED / COMPLETED），
 * 但界面上要显示 9 种状态 —— 多出来的 3 种（待开始 / 请假中 / 逾期）是<b>按时间实时算出来的</b>：
 *
 * <pre>
 *   status = APPROVED 且 actual_end_time 为空 时，看当前时间落在哪：
 *     now &lt;  start_time              → WAITING_START（待开始）
 *     start_time &lt;= now &lt;= end_time  → IN_PROGRESS（请假中）
 *     now &gt;  end_time                → OVERDUE（逾期未销假）
 *
 *   status 为其他 5 个值时，原样返回。
 * </pre>
 *
 * <p><b>为什么不用定时任务把状态刷进数据库</b>：
 * 时间是连续流动的，定时任务（比如每 5 分钟跑一次）必然存在最多 5 分钟的窗口期错误；
 * 而且任务漏跑、服务重启期间都会导致数据与真实情况不一致。
 * 改成「用时才算」，只要服务器时间对，展示就永远准确，还省掉一个定时任务。
 *
 * <p>注意：{@code status=APPROVED} 一旦写了 {@code actual_end_time}，说明已销假，
 * 此时数据库状态会被更新为 COMPLETED，所以这里不会出现「已销假但还算 IN_PROGRESS」的情况。
 */
public enum EffectiveStatus {
    /** 待审批 */
    PENDING,
    /** 已通过但还没到开始时间 */
    WAITING_START,
    /** 请假中（时间区间内） */
    IN_PROGRESS,
    /** 已过结束时间但未销假 */
    OVERDUE,
    /** 已驳回 */
    REJECTED,
    /** 已撤回 */
    WITHDRAWN,
    /** 已取消 */
    CANCELLED,
    /** 已完成（已销假） */
    COMPLETED;

    /**
     * 计算某条申请在当前时刻的展示态。
     *
     * @param app 申请实体
     * @param now 参考时间（传进来而不是内部取 now()，便于单元测试与批量计算时统一时间基准）
     */
    public static EffectiveStatus of(LeaveApplication app, LocalDateTime now) {
        String status = app.getStatus();
        // 非 APPROVED 的状态直接映射（REJECTED / WITHDRAWN / CANCELLED / COMPLETED / PENDING）
        if (!"APPROVED".equals(status)) {
            try {
                return EffectiveStatus.valueOf(status);
            } catch (IllegalArgumentException e) {
                // 兜底：数据库出现未知状态时按待审批处理，避免整页报错
                return PENDING;
            }
        }

        // status = APPROVED：按时间推导
        if (app.getActualEndTime() != null) {
            // 已写实际结束时间 → 已销假（正常流程下 status 已同步为 COMPLETED，这里做防御）
            return COMPLETED;
        }
        if (now.isBefore(app.getStartTime())) {
            return WAITING_START;
        }
        if (now.isAfter(app.getEndTime())) {
            return OVERDUE;
        }
        return IN_PROGRESS;
    }

    /** 是否为「进行中的有效请假」（请假中或逾期），用于首页挑选主卡片 */
    public boolean isActive() {
        return this == IN_PROGRESS || this == OVERDUE;
    }

    /** 是否已经终结（不会再变化），用于记录页的"已结束"筛选 */
    public boolean isClosed() {
        return this == COMPLETED || this == REJECTED || this == WITHDRAWN || this == CANCELLED;
    }
}
