package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 销假 / 定位 / 人工核验记录表实体（02 §9）。
 *
 * <p>设计要点：<b>每次销假尝试都单独插一条记录</b>，不改写历史记录。
 * 这样「定位失败 → 申请人工核验 → 被驳回 → 重新定位成功」这条链，
 * 每一步都留有痕迹，可审计、可追溯，也天然支持「驳回后再次申请核验」。
 */
@Data
@TableName("leave_checkin_log")
public class LeaveCheckinLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private String checkType;       // GPS / ON_CAMPUS_CONFIRM / MANUAL_REVIEW
    private String checkResult;     // PASSED / FAILED
    private String reviewStatus;    // NONE / PENDING_REVIEW / APPROVED / REJECTED / VOID
    private String closeReason;     // 关闭原因（被自助销假取代等）
    private LocalDateTime closedAt;
    private BigDecimal distanceM;   // GPS 距离（米），用于展示"距离校区 320 米"
    private Long operatorId;
    private LocalDateTime checkTime;
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private String reviewComment;
    private Integer overdueAtCompletion;  // 完成时是否已逾期（0/1 快照）
    private Integer delayMinutes;         // 完成时超出批准结束时间的分钟数
    private LocalDateTime createdAt;
}
