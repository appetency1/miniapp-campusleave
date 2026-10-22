package com.campusleave.student;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.NotificationService;
import com.campusleave.domain.entity.LeaveApplication;
import com.campusleave.domain.entity.SystemConfig;
import com.campusleave.domain.mapper.SystemConfigMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 逾期 / 开始提醒（01_业务规则 §36）。
 *
 * <p><b>为什么不做定时任务</b>：V1.2 明确"不强制实现定时任务系统"，改为
 * 「用户打开首页时实时计算 → 需要提醒就生成一条」。好处是不引入调度组件，
 * 也不会出现"任务漏跑导致提醒缺失"；代价是学生一直不开小程序就收不到提醒，
 * 这在毕设场景下可接受（规则原文也是这么定的）。
 *
 * <p>去重交给 {@link NotificationService} 的 dedupKey（自然日桶）：
 * 学生一天开十次首页，也只会有一条逾期提醒。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudentReminderService {

    /** 开始时提前多少分钟提醒（system_config 可调） */
    private static final String KEY_START_WINDOW = "START_REMINDER_WINDOW_MINUTES";
    private static final int DEFAULT_START_WINDOW = 30;

    private final NotificationService notificationService;
    private final SystemConfigMapper configMapper;

    /**
     * 扫描某学生的有效申请，按需生成提醒。
     *
     * @param userId 接收人（user.id，不是 student_profile.id）
     * @param apps   该学生全部申请（复用首页已查出的列表，不再查库）
     * @param now    当前时间
     */
    public void sweep(Long userId, List<LeaveApplication> apps, LocalDateTime now) {
        if (userId == null || apps == null || apps.isEmpty()) return;

        int windowMinutes = intConfig(KEY_START_WINDOW, DEFAULT_START_WINDOW);

        for (LeaveApplication a : apps) {
            // 只有 APPROVED 且未销假的申请才需要提醒
            if (!"APPROVED".equals(a.getStatus()) || a.getActualEndTime() != null) continue;

            EffectiveStatus es = EffectiveStatus.of(a, now);

            if (es == EffectiveStatus.OVERDUE) {
                long minutes = Math.max(0, Duration.between(a.getEndTime(), now).toMinutes());
                notificationService.notifyUser(userId, "OVERDUE_REMINDER", "请假已逾期",
                        "本次请假应于 " + a.getEndTime().toLocalDate() + " " + hhmm(a.getEndTime())
                                + " 结束，已逾期 " + humanDuration(minutes) + "，请尽快返校销假",
                        a.getId());
                continue;
            }

            if (es == EffectiveStatus.WAITING_START) {
                long minutesToStart = Duration.between(now, a.getStartTime()).toMinutes();
                if (minutesToStart <= windowMinutes) {
                    notificationService.notifyUser(userId, "START_REMINDER", "请假即将开始",
                            "你的请假将于 " + hhmm(a.getStartTime()) + " 开始（"
                                    + sceneLabel(a.getLeaveScene()) + "），请注意行程安排",
                            a.getId());
                }
            }
        }
    }

    private String hhmm(LocalDateTime t) {
        return String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private String humanDuration(long minutes) {
        if (minutes < 60) return minutes + " 分钟";
        long h = minutes / 60;
        long m = minutes % 60;
        if (h < 24) return m > 0 ? h + " 小时 " + m + " 分钟" : h + " 小时";
        long d = h / 24;
        long rh = h % 24;
        return rh > 0 ? d + " 天 " + rh + " 小时" : d + " 天";
    }

    private String sceneLabel(String scene) {
        return "OFF_CAMPUS".equals(scene) ? "离校" : "校内";
    }

    private int intConfig(String key, int def) {
        SystemConfig c = configMapper.selectOne(
                Wrappers.<SystemConfig>lambdaQuery().eq(SystemConfig::getConfigKey, key));
        if (c == null || c.getConfigValue() == null) return def;
        try {
            return Integer.parseInt(c.getConfigValue().trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
