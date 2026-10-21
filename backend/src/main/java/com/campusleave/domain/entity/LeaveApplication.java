package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 请假申请主表实体（02 §6）。
 *
 * <p><b>关键设计（答辩要点）</b>：数据库里只存 6 个<b>持久状态</b>：
 * PENDING / APPROVED / REJECTED / WITHDRAWN / CANCELLED / COMPLETED。
 * 「待开始 WAITING_START」「请假中 IN_PROGRESS」「逾期 OVERDUE」这三个
 * <b>不是数据库字段</b>，而是后端按 start_time / end_time / 当前时间实时算出来的
 * <b>计算展示态（effectiveStatus）</b>。
 *
 * <p>为什么不存这 3 个状态：它们是<b>时间推导出来的</b>，存下来就要靠定时任务不停刷新，
 * 一旦任务漏跑就会和真实时间不一致。改成实时计算，永远准确、无需定时任务。
 * 见 01_业务规则 §4.1。
 */
@Data
@TableName("leave_application")
public class LeaveApplication {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String applicationNo;      // 申请编号，唯一（如 LA202610200001）
    private Long studentId;            // 学生ID（student_profile.id，不是 user.id）
    private String leaveScene;         // OFF_CAMPUS 离校 / ON_CAMPUS 校内
    private String leaveType;          // SICK / PERSONAL / OTHER
    private LocalDateTime startTime;   // 请假开始时间
    private LocalDateTime endTime;     // 当前已批准的有效结束时间（续假通过会往后推）
    private String reason;             // 请假原因
    private String destination;        // 离校去向
    private String contactPhone;       // 请假期间联系电话
    private String status;             // 6 个持久状态之一
    private LocalDateTime actualEndTime;   // 实际结束时间（销假/核验通过时写入）
    private String cancelReason;       // 取消原因
    private LocalDateTime cancelledAt;
    private Long cancelledByUserId;
    private Long approvedByUserId;     // 审批人 user.id
    private LocalDateTime approvedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
