package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 站内通知表实体（02 §14）。
 *
 * <p>去重机制：dedup_key 唯一键（配合 receiver_id）。
 * 一次性事件用业务标识（如 APP_12_LEAVE_APPROVED），
 * 周期性提醒用<b>自然日桶</b>（如 APP_12_OVERDUE_REMINDER_2026-10-20），
 * 保证同一天内反复进出首页也只生成一条提醒。
 */
@Data
@TableName("notification")
public class Notification {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long receiverId;     // 接收人 user.id（本系统只发给学生）
    private String type;         // LEAVE_APPROVED / OVERDUE_REMINDER / ...
    private String title;
    private String content;
    private Long businessId;     // 关联业务 ID（一般指向 leave_application.id）
    private String businessType; // APPLICATION / EXTENSION
    private String dedupKey;     // 去重键
    private Integer isRead;      // 0 未读 / 1 已读
    private LocalDateTime createdAt;
}
