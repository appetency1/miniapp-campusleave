package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 操作日志表实体（02 §10）。
 *
 * <p>所有关键动作（提交/审批/撤回/取消/销假/续假）都往这里写一条，
 * 用于：① 详情页时间轴展示；② 审批意见来源（主表没有 approval_comment 字段）；
 * ③ 事后审计（谁在什么时候改了什么）。
 */
@Data
@TableName("leave_approval_log")
public class LeaveApprovalLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private Long extensionId;    // 续假相关动作才有
    private Long operatorId;     // 操作人 user.id
    private String action;       // SUBMIT / APPROVE / REJECT / WITHDRAW / CANCEL / COMPLETE / ...
    private String oldStatus;
    private String newStatus;
    private String comment;      // 审批意见 / 撤回原因
    private LocalDateTime createdAt;
}
