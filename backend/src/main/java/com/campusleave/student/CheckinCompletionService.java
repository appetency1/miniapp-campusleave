package com.campusleave.student;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.*;
import com.campusleave.domain.mapper.*;
import com.campusleave.common.NotificationService;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 「销假完成」的事务边界。
 *
 * <p><b>为什么单独抽一个 Service</b>（本次踩坑的直接原因）：
 * GPS 销假有两条路径 —— 通过（要改状态、写记录、做三个副作用）和不通过（只写一条失败记录就报错）。
 * 如果整个方法标 {@code @Transactional}，那么"不通过"抛异常时<b>连失败记录也一起回滚</b>，
 * 导致学生随后申请人工核验时报「没有定位失败记录」。
 *
 * <p>所以拆开：失败记录在<b>事务外</b>直接落库（自动提交），
 * 只有"通过"这条路径进事务。Spring 的 {@code @Transactional} 依赖代理，
 * 类内自调用不生效，必须拆成独立 Bean 才能保证边界正确。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CheckinCompletionService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final LeaveApplicationMapper applicationMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveApprovalLogMapper approvalLogMapper;
    private final NotificationService notificationService;

    /**
     * 把申请置为 COMPLETED，并执行三个副作用（同一事务）。
     *
     * @param app       已校验归属与状态的申请
     * @param checkType GPS / ON_CAMPUS_CONFIRM
     * @param distanceM GPS 距离（校内确认传 null）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> complete(LeaveApplication app, String checkType, BigDecimal distanceM) {
        LocalDateTime now = LocalDateTime.now();
        EffectiveStatus es = EffectiveStatus.of(app, now);
        if (es != EffectiveStatus.IN_PROGRESS && es != EffectiveStatus.OVERDUE) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "当前状态不需要销假");
        }

        boolean overdue = es == EffectiveStatus.OVERDUE;
        int delayMinutes = overdue
                ? (int) Math.max(0, Duration.between(app.getEndTime(), now).toMinutes())
                : 0;

        // ① 条件更新主表：只有还是 APPROVED 且未写实际结束时间才改（并发守卫）
        int rows = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "COMPLETED")
                        .set(LeaveApplication::getActualEndTime, now)
                        .set(LeaveApplication::getUpdatedAt, now)
                        .eq(LeaveApplication::getId, app.getId())
                        .eq(LeaveApplication::getStatus, "APPROVED")
                        .isNull(LeaveApplication::getActualEndTime));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT);
        }

        // ② 本次销假记录（带逾期快照）
        LeaveCheckinLog passed = new LeaveCheckinLog();
        passed.setApplicationId(app.getId());
        passed.setCheckType(checkType);
        passed.setCheckResult("PASSED");
        passed.setReviewStatus("NONE");
        passed.setDistanceM(distanceM);
        passed.setOperatorId(CurrentUser.requireUserId());
        passed.setCheckTime(now);
        passed.setOverdueAtCompletion(overdue ? 1 : 0);
        passed.setDelayMinutes(delayMinutes);
        passed.setCreatedAt(now);
        checkinLogMapper.insert(passed);

        // ③ 副作用一：关闭"定位失败且未被处理"的历史记录
        checkinLogMapper.update(null,
                Wrappers.<LeaveCheckinLog>lambdaUpdate()
                        .set(LeaveCheckinLog::getReviewStatus, "VOID")
                        .set(LeaveCheckinLog::getCloseReason, "SUPERSEDED_BY_SELF_CHECKIN")
                        .set(LeaveCheckinLog::getClosedAt, now)
                        .eq(LeaveCheckinLog::getApplicationId, app.getId())
                        .eq(LeaveCheckinLog::getCheckType, "GPS")
                        .eq(LeaveCheckinLog::getCheckResult, "FAILED")
                        .eq(LeaveCheckinLog::getReviewStatus, "NONE"));

        // ④ 副作用二：待核验记录置 VOID（本人已自助销假，核验无意义）
        checkinLogMapper.update(null,
                Wrappers.<LeaveCheckinLog>lambdaUpdate()
                        .set(LeaveCheckinLog::getReviewStatus, "VOID")
                        .set(LeaveCheckinLog::getCloseReason, "SUPERSEDED_BY_SELF_CHECKIN")
                        .set(LeaveCheckinLog::getClosedAt, now)
                        .eq(LeaveCheckinLog::getApplicationId, app.getId())
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"));

        // ⑤ 副作用三：自动撤回待审续假 + 通知
        int withdrawn = extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "WITHDRAWN")
                        .set(LeaveExtension::getWithdrawReason, "已完成销假，续假自动撤回")
                        .set(LeaveExtension::getWithdrawnAt, now)
                        .set(LeaveExtension::getUpdatedAt, now)
                        .eq(LeaveExtension::getApplicationId, app.getId())
                        .eq(LeaveExtension::getStatus, "PENDING"));
        if (withdrawn > 0) {
            notificationService.notifyStudent(app.getStudentId(), "EXTENSION_AUTO_WITHDRAWN", "续假已自动撤回",
                    "你已完成销假，待审的续假申请已自动撤回", app.getId());
        }

        notificationService.notifyStudent(app.getStudentId(), "CHECKIN_RESULT", "销假成功",
                (overdue ? "逾期补销假成功" : "销假成功") + "，本次请假已结束", app.getId());

        // ⑥ 留痕
        LeaveApprovalLog logRow = new LeaveApprovalLog();
        logRow.setApplicationId(app.getId());
        logRow.setOperatorId(CurrentUser.requireUserId());
        logRow.setAction("COMPLETE");
        logRow.setOldStatus("APPROVED");
        logRow.setNewStatus("COMPLETED");
        logRow.setComment("销假方式：" + ("GPS".equals(checkType) ? "返校定位" : "校内自主确认"));
        logRow.setCreatedAt(now);
        approvalLogMapper.insert(logRow);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "COMPLETED");
        data.put("actualEndTime", now.format(DT));
        data.put("overdueAtCompletion", overdue);
        data.put("delayMinutes", delayMinutes);
        return data;
    }

    /**
     * 记录一次失败的定位尝试（事务外，自动提交）。
     *
     * <p>这条记录是后续「申请人工核验」的前置条件，必须保留。
     */
    public void recordGpsFailure(Long applicationId, BigDecimal distanceM) {
        LeaveCheckinLog row = new LeaveCheckinLog();
        row.setApplicationId(applicationId);
        row.setCheckType("GPS");
        row.setCheckResult("FAILED");
        row.setReviewStatus("NONE");
        row.setDistanceM(distanceM);
        row.setOperatorId(CurrentUser.requireUserId());
        row.setCheckTime(LocalDateTime.now());
        row.setCreatedAt(LocalDateTime.now());
        checkinLogMapper.insert(row);
    }

}
