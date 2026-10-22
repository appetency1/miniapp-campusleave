package com.campusleave.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时做一次数据一致性自检。
 *
 * <p><b>为什么需要它</b>：有些约束数据库表达不了 ——
 * 「学号要等于登录名」是两个表之间的事，MySQL 的 CHECK 无法跨表；
 * 「审批人必须是教师」同理。这些只能靠应用层保证，而应用层保证的前提是
 * "没有绕过应用层写进去的数据"（手工改库、导数据、跑脚本都会绕过去）。
 *
 * <p>所以启动时花几毫秒扫一遍，发现不一致就**打 ERROR**，不阻塞启动 ——
 * 演示当天因为一条历史脏数据起不来服务，比数据不一致严重得多。
 *
 * <p>数据量：本系统是院系级（万级以内），全表 COUNT 可以接受。
 * 真到百万级应该改成抽样或在低峰期跑。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataConsistencyChecker implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        check("学号与登录账号不一致（student_profile.student_no ≠ user.username）",
                "SELECT COUNT(*) FROM student_profile sp JOIN `user` u ON u.id = sp.user_id "
                        + "WHERE u.username <> sp.student_no");

        check("工号与登录账号不一致（teacher_profile.teacher_no ≠ user.username）",
                "SELECT COUNT(*) FROM teacher_profile tp JOIN `user` u ON u.id = tp.user_id "
                        + "WHERE u.username <> tp.teacher_no");

        check("学生所学专业/年级与所属班级不一致",
                "SELECT COUNT(*) FROM student_profile sp JOIN class_info c ON c.id = sp.class_id "
                        + "WHERE (sp.major IS NOT NULL AND c.major IS NOT NULL AND sp.major <> c.major) "
                        + "   OR (sp.grade IS NOT NULL AND c.grade IS NOT NULL AND sp.grade <> c.grade)");

        check("审批人不是教师角色",
                "SELECT COUNT(*) FROM leave_application la JOIN `user` u ON u.id = la.approved_by_user_id "
                        + "WHERE u.role <> 'TEACHER'");

        check("状态与时间不自洽（已完成但无销假时间 / 已通过却有销假时间）",
                "SELECT COUNT(*) FROM leave_application "
                        + "WHERE (status = 'COMPLETED' AND actual_end_time IS NULL) "
                        + "   OR (status = 'APPROVED'  AND actual_end_time IS NOT NULL)");

        check("孤儿通知（business_id 指向不存在的申请）",
                "SELECT COUNT(*) FROM notification n "
                        + "WHERE n.business_type = 'APPLICATION' "
                        + "  AND NOT EXISTS (SELECT 1 FROM leave_application la WHERE la.id = n.business_id)");
    }

    private void check(String name, String sql) {
        try {
            Integer n = jdbc.queryForObject(sql, Integer.class);
            if (n != null && n > 0) {
                log.error("[数据自检] {} 共 {} 条，请检查", name, n);
            } else {
                log.info("[数据自检] {} 正常", name);
            }
        } catch (Exception e) {
            // 自检本身不能拖垮启动
            log.warn("[数据自检] {} 执行失败：{}", name, e.getMessage());
        }
    }
}
