package com.campusleave.common;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.domain.entity.Notification;
import com.campusleave.domain.entity.StudentProfile;
import com.campusleave.domain.mapper.NotificationMapper;
import com.campusleave.domain.mapper.StudentProfileMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Set;

/**
 * 站内消息落库的唯一入口。
 *
 * <p>抽出来的原因：审批、核验、销假、首页提醒四处都要发消息，原来每个 Service 各写一份
 * private notify()，dedupKey 格式一旦不一致就会出现"同一件事两条消息"或者"该有的没有"。
 *
 * <p><b>幂等规则</b>（01_业务规则 §36）：{@code dedupKey = APP_{申请id}_{类型}_{自然日}}，
 * 依赖 notification 表 (receiver_id, dedup_key) 的唯一键。同一天同一件事重复触发只留一条，
 * 所以可以放心在"每次打开首页"这种高频入口调用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final StudentProfileMapper studentMapper;
    private final NotificationMapper notificationMapper;

    /**
     * 按学生 id 发送（调用方手上是 leave_application.student_id 时用这个）。
     * 内部转成 receiver_id（= user.id）后再落库。
     */
    public void notifyStudent(Long studentId, String type, String title, String content, Long applicationId) {
        if (studentId == null) return;
        StudentProfile sp = studentMapper.selectById(studentId);
        if (sp == null) {
            log.warn("notify skipped: student profile {} not found", studentId);
            return;
        }
        doNotify(sp.getUserId(), type, title, content, applicationId);
    }

    /** 已知 user_id 时直接发送（首页提醒场景，避免重复反查 student_profile） */
    public void notifyUser(Long userId, String type, String title, String content, Long applicationId) {
        if (userId == null) return;
        doNotify(userId, type, title, content, applicationId);
    }

    /**
     * 周期性提醒类型：dedupKey 带自然日，隔天可以再发一次。
     * 其余类型视为一次性事件，dedupKey 不带日期 —— 同一件事一生只发一条。
     */
    private static final Set<String> DAILY_TYPES = Set.of("START_REMINDER", "OVERDUE_REMINDER");

    private void doNotify(Long userId, String type, String title, String content, Long applicationId) {
        Notification n = new Notification();
        n.setReceiverId(userId);
        n.setType(type);
        n.setTitle(title);
        n.setContent(content);
        n.setBusinessId(applicationId);
        n.setBusinessType(applicationId == null ? null : "APPLICATION");
        // 01 §36：一次性事件用稳定键，周期性提醒用自然日桶
        String base = applicationId == null ? null : "APP_" + applicationId + "_" + type;
        if (base != null && DAILY_TYPES.contains(type)) {
            base = base + "_" + LocalDate.now();
        }
        n.setDedupKey(base);
        n.setIsRead(0);
        n.setCreatedAt(LocalDateTime.now());
        try {
            notificationMapper.insert(n);
        } catch (DuplicateKeyException e) {
            // 同键已存在：刷新文案（逾期提醒里的"已逾期 X 小时"必须是最新的），仍只保留一条
            if (n.getDedupKey() != null) {
                notificationMapper.update(null,
                        Wrappers.<Notification>lambdaUpdate()
                                .set(Notification::getTitle, title)
                                .set(Notification::getContent, content)
                                .eq(Notification::getReceiverId, userId)
                                .eq(Notification::getDedupKey, n.getDedupKey()));
            }
        } catch (Exception e) {
            // 通知失败不能影响主业务（审批/销假已经成功了）
            log.warn("notify failed: userId={} type={} err={}", userId, type, e.getMessage());
        }
    }
}
