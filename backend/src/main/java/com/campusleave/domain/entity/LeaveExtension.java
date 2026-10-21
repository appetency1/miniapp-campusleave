package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 续假记录表实体（02 §7）。
 *
 * <p>续假是<b>独立记录</b>，不直接改主申请的 end_time —— 只有辅导员批准后才回写主表。
 * 原因：续假也要走审批，未批之前不能影响原请假的有效结束时间。
 *
 * <p>「同一申请最多一条待审续假」由数据库生成列 pending_app_id 的唯一键保证（见 schema）。
 */
@Data
@TableName("leave_extension")
public class LeaveExtension {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;         // 原请假申请
    private LocalDateTime requestedEndTime;  // 申请延长至
    private String reason;              // 续假原因
    private String status;              // PENDING / APPROVED / REJECTED / WITHDRAWN
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private String reviewComment;
    private String withdrawReason;
    private LocalDateTime withdrawnAt;
    private Long withdrawnBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
