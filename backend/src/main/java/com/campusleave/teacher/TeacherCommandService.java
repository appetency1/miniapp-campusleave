package com.campusleave.teacher;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.common.NotificationService;
import com.campusleave.domain.entity.*;
import com.campusleave.domain.mapper.*;
import com.campusleave.security.CurrentUser;
import com.campusleave.student.EffectiveStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 教师端写操作（03_API §6.4 / §6.5 / §6.7 / §6.8 / §6.11）。
 *
 * <p>五个动作的共性，也是答辩要讲清的部分：
 * <ol>
 *   <li><b>先校验数据范围</b>：{{@link TeacherScopeService#assertStudentInScope}}，
 *       教师只能处理自己班级的学生，越权 40301</li>
 *   <li><b>再条件更新</b>：{@code WHERE id=? AND status='PENDING'}，
 *   rows != 1 就抛 40901。这是防并发重复审批的关键 ——
 *   两个教师同时点"通过"，只有一个人的 UPDATE 能命中</li>
 *   <li><b>写审批日志 + 通知学生</b>，三件事在同一事务里，要么全成要么全不成</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class TeacherCommandService {

    private static final java.time.format.DateTimeFormatter DT =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final TeacherScopeService scope;
    private final LeaveApplicationMapper applicationMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveApprovalLogMapper approvalLogMapper;
    private final NotificationService notificationService;
    private final UserMapper userMapper;

    // ==================== 6.4 批准 ====================

    @Transactional(rollbackFor = Exception.class)
    public void approve(Long applicationId, String comment) {
        LeaveApplication app = mustProcessable(applicationId);
        LocalDateTime now = LocalDateTime.now();

        int rows = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "APPROVED")
                        .set(LeaveApplication::getApprovedByUserId, CurrentUser.requireUserId())
                        .set(LeaveApplication::getApprovedAt, now)
                        .set(LeaveApplication::getUpdatedAt, now)
                        .eq(LeaveApplication::getId, applicationId)
                        .eq(LeaveApplication::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该申请已被处理，请刷新");
        }

        log(applicationId, null, "APPROVE", "PENDING", "APPROVED", blankTo(comment, "同意"));
        notificationService.notifyStudent(app.getStudentId(), "LEAVE_APPROVED", "请假已通过",
                TeacherQueryService.sceneLabel(app.getLeaveScene()) + " · "
                        + TeacherQueryService.typeLabel(app.getLeaveType())
                        + " 的请假申请已通过审批", applicationId);
    }

    // ==================== 6.5 驳回 ====================

    @Transactional(rollbackFor = Exception.class)
    public void reject(Long applicationId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BizException(ErrorCode.BAD_PARAM, "驳回理由必填");
        }
        LeaveApplication app = mustProcessable(applicationId);
        LocalDateTime now = LocalDateTime.now();

        int rows = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "REJECTED")
                        .set(LeaveApplication::getApprovedByUserId, CurrentUser.requireUserId())
                        .set(LeaveApplication::getApprovedAt, now)
                        .set(LeaveApplication::getUpdatedAt, now)
                        .eq(LeaveApplication::getId, applicationId)
                        .eq(LeaveApplication::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该申请已被处理，请刷新");
        }

        // 驳回理由存进日志：主表没有 reject_reason 字段（02 §leave_application），
        // 学生端详情与后台列表都从 approval_log 取最近一条 REJECT 的 comment
        log(applicationId, null, "REJECT", "PENDING", "REJECTED", reason.trim());
        notificationService.notifyStudent(app.getStudentId(), "LEAVE_REJECTED", "请假被驳回",
                "驳回理由：" + reason.trim(), applicationId);
    }

    // ==================== 6.7 续假批准 ====================

    @Transactional(rollbackFor = Exception.class)
    public void approveExtension(Long extensionId, String comment) {
        LeaveExtension ext = extensionMapper.selectById(extensionId);
        if (ext == null) throw new BizException(ErrorCode.NOT_FOUND, "续假申请不存在");

        LeaveApplication app = applicationMapper.selectById(ext.getApplicationId());
        if (app == null) throw new BizException(ErrorCode.NOT_FOUND, "原申请不存在");
        scope.assertStudentInScope(app.getStudentId());

        if (!"PENDING".equals(ext.getStatus())) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该续假已被处理，请刷新");
        }
        if (!"APPROVED".equals(app.getStatus()) || app.getActualEndTime() != null) {
            // 主申请已销假 → 续假自动作废，避免"假都销了还在批续假"
            extensionMapper.update(null,
                    Wrappers.<LeaveExtension>lambdaUpdate()
                            .set(LeaveExtension::getStatus, "WITHDRAWN")
                            .set(LeaveExtension::getWithdrawReason, "原申请已完成，续假自动撤回")
                            .set(LeaveExtension::getWithdrawnAt, LocalDateTime.now())
                            .eq(LeaveExtension::getId, extensionId)
                            .eq(LeaveExtension::getStatus, "PENDING"));
            throw new BizException(ErrorCode.STATUS_CONFLICT, "原申请已完成，该续假已自动撤回");
        }

        // 复查延长后是否与该学生的其他有效申请重叠（03 §6.7 第 3 步）
        assertNoOverlap(app, ext.getRequestedEndTime());

        LocalDateTime now = LocalDateTime.now();
        int rows = extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "APPROVED")
                        .set(LeaveExtension::getReviewerId, CurrentUser.requireUserId())
                        .set(LeaveExtension::getReviewedAt, now)
                        .set(LeaveExtension::getReviewComment, blankTo(comment, "同意延长"))
                        .eq(LeaveExtension::getId, extensionId)
                        .eq(LeaveExtension::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该续假已被处理，请刷新");
        }

        applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getEndTime, ext.getRequestedEndTime())
                        .set(LeaveApplication::getUpdatedAt, now)
                        .eq(LeaveApplication::getId, app.getId()));

        log(app.getId(), extensionId, "EXTENSION_APPROVE", "PENDING", "APPROVED",
                blankTo(comment, "同意延长"));
        notificationService.notifyStudent(app.getStudentId(), "EXTENSION_APPROVED", "续假已通过",
                "请假结束时间延长至 " + ext.getRequestedEndTime().format(DT), app.getId());
    }

    // ==================== 6.8 续假驳回 ====================

    @Transactional(rollbackFor = Exception.class)
    public void rejectExtension(Long extensionId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BizException(ErrorCode.BAD_PARAM, "驳回理由必填");
        }
        LeaveExtension ext = extensionMapper.selectById(extensionId);
        if (ext == null) throw new BizException(ErrorCode.NOT_FOUND, "续假申请不存在");
        LeaveApplication app = applicationMapper.selectById(ext.getApplicationId());
        if (app == null) throw new BizException(ErrorCode.NOT_FOUND, "原申请不存在");
        scope.assertStudentInScope(app.getStudentId());

        if (!"PENDING".equals(ext.getStatus())) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该续假已被处理，请刷新");
        }

        int rows = extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "REJECTED")
                        .set(LeaveExtension::getReviewerId, CurrentUser.requireUserId())
                        .set(LeaveExtension::getReviewedAt, LocalDateTime.now())
                        .set(LeaveExtension::getReviewComment, reason.trim())
                        .eq(LeaveExtension::getId, extensionId)
                        .eq(LeaveExtension::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该续假已被处理，请刷新");
        }

        log(app.getId(), extensionId, "EXTENSION_REJECT", "PENDING", "REJECTED", reason.trim());
        notificationService.notifyStudent(app.getStudentId(), "EXTENSION_REJECTED", "续假被驳回",
                "驳回理由：" + reason.trim(), app.getId());
    }

    // ==================== 6.11 核验通过 / 驳回 ====================

    /**
     * 人工核验。
     *
     * <p>APPROVE 的语义是"学生确实回校了，只是定位没打准"，所以直接把主申请完成；
     * REJECT 的语义是"还不能算回校"，主申请保持 APPROVED，学生可以重新定位或再申请核验。
     */
    @Transactional(rollbackFor = Exception.class)
    public void reviewCheckin(Long checkinId, String action, String comment) {
        LeaveCheckinLog logRow = checkinLogMapper.selectById(checkinId);
        if (logRow == null) throw new BizException(ErrorCode.NOT_FOUND, "核验记录不存在");

        LeaveApplication app = applicationMapper.selectById(logRow.getApplicationId());
        if (app == null) throw new BizException(ErrorCode.NOT_FOUND, "申请不存在");
        scope.assertStudentInScope(app.getStudentId());

        if (!"PENDING_REVIEW".equals(logRow.getReviewStatus())) {
            throw new BizException(ErrorCode.CHECKIN_NOT_PROCESSABLE,
                    "该记录已处理（" + logRow.getReviewStatus() + "），不能重复核验");
        }

        // 枚举必须显式校验：之前用 "APPROVE".equalsIgnoreCase(action) 判断，
        // action 传 null 或拼错（如 approved:true）会静默走「驳回」分支 —— 
        // 教师点"通过"却把学生判成未通过，且接口仍返回 200。
        if (!"APPROVE".equalsIgnoreCase(action) && !"REJECT".equalsIgnoreCase(action)) {
            throw new BizException(ErrorCode.BAD_PARAM, "核验动作只能是 APPROVE 或 REJECT");
        }
        boolean approve = "APPROVE".equalsIgnoreCase(action);
        LocalDateTime now = LocalDateTime.now();

        int rows = checkinLogMapper.update(null,
                Wrappers.<LeaveCheckinLog>lambdaUpdate()
                        .set(LeaveCheckinLog::getReviewStatus, approve ? "APPROVED" : "REJECTED")
                        .set(LeaveCheckinLog::getReviewerId, CurrentUser.requireUserId())
                        .set(LeaveCheckinLog::getReviewedAt, now)
                        .set(LeaveCheckinLog::getClosedAt, now)
                        .set(LeaveCheckinLog::getReviewComment, blankTo(comment, approve ? "核验通过" : "核验驳回"))
                        .eq(LeaveCheckinLog::getId, checkinId)
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT, "该记录已被处理，请刷新");
        }

        if (!approve) {
            // 用 MANUAL_REVIEW（ck_log_action 只允许这些枚举值），驳回靠 comment 与 new_status 区分
            log(app.getId(), null, "MANUAL_REVIEW", "APPROVED", "APPROVED",
                    blankTo(comment, "核验驳回，学生可重新定位"));
            notificationService.notifyStudent(app.getStudentId(), "CHECKIN_RESULT", "销假核验未通过",
                    blankTo(comment, "核验未通过，请重新定位销假或再次申请核验"), app.getId());
            return;
        }

        // 通过：主申请 → COMPLETED（条件更新，防止学生在此刻自助销假造成双完成）
        EffectiveStatus es = EffectiveStatus.of(app, now);
        boolean overdue = es == EffectiveStatus.OVERDUE;
        int delayMinutes = overdue ? (int) Math.max(0, Duration.between(app.getEndTime(), now).toMinutes()) : 0;

        int ok = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "COMPLETED")
                        .set(LeaveApplication::getActualEndTime, now)
                        .set(LeaveApplication::getUpdatedAt, now)
                        .eq(LeaveApplication::getId, app.getId())
                        .eq(LeaveApplication::getStatus, "APPROVED")
                        .isNull(LeaveApplication::getActualEndTime));
        if (ok != 1) {
            // 主申请已经不是 APPROVED（学生刚自助销假）→ 本记录置 VOID
            checkinLogMapper.update(null,
                    Wrappers.<LeaveCheckinLog>lambdaUpdate()
                            .set(LeaveCheckinLog::getReviewStatus, "VOID")
                            .set(LeaveCheckinLog::getCloseReason, "SUPERSEDED_BY_SELF_CHECKIN")
                            .eq(LeaveCheckinLog::getId, checkinId));
            throw new BizException(ErrorCode.CHECKIN_NOT_PROCESSABLE,
                    "该申请已完成销假，本条核验记录已作废");
        }

        // 逾期快照写在通过的这条记录上（01 §4.3 要求完成时记录是否逾期）
        checkinLogMapper.update(null,
                Wrappers.<LeaveCheckinLog>lambdaUpdate()
                        .set(LeaveCheckinLog::getOverdueAtCompletion, overdue ? 1 : 0)
                        .set(LeaveCheckinLog::getDelayMinutes, delayMinutes)
                        .eq(LeaveCheckinLog::getId, checkinId));

        // 同一申请下其他待核验记录一并作废
        checkinLogMapper.update(null,
                Wrappers.<LeaveCheckinLog>lambdaUpdate()
                        .set(LeaveCheckinLog::getReviewStatus, "VOID")
                        .set(LeaveCheckinLog::getCloseReason, "SUPERSEDED_BY_MANUAL_REVIEW")
                        .set(LeaveCheckinLog::getClosedAt, now)
                        .eq(LeaveCheckinLog::getApplicationId, app.getId())
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW")
                        .ne(LeaveCheckinLog::getId, checkinId));

        // 完成即撤回待审续假
        extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "WITHDRAWN")
                        .set(LeaveExtension::getWithdrawReason, "原申请已完成，续假自动撤回")
                        .set(LeaveExtension::getWithdrawnAt, now)
                        .eq(LeaveExtension::getApplicationId, app.getId())
                        .eq(LeaveExtension::getStatus, "PENDING"));

        log(app.getId(), null, "MANUAL_REVIEW", "APPROVED", "COMPLETED",
                blankTo(comment, "人工核验通过" + (overdue ? "（逾期 " + delayMinutes + " 分钟）" : "")));
        notificationService.notifyStudent(app.getStudentId(), "CHECKIN_RESULT", "销假核验通过",
                "人工核验已通过，本次请假已完成", app.getId());
    }

    // ==================== 内部工具 ====================

    /** 取申请 + 校验范围 + 校验仍可审批 */
    private LeaveApplication mustProcessable(Long applicationId) {
        LeaveApplication app = applicationMapper.selectById(applicationId);
        if (app == null) throw new BizException(ErrorCode.NOT_FOUND, "申请不存在");
        scope.assertStudentInScope(app.getStudentId());
        if (!"PENDING".equals(app.getStatus())) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "只有待审批的申请可以审批");
        }
        return app;
    }

    /** 续假延长后不能与该学生其他有效申请重叠（40903） */
    private void assertNoOverlap(LeaveApplication app, LocalDateTime newEnd) {
        Long count = applicationMapper.selectCount(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, app.getStudentId())
                        .ne(LeaveApplication::getId, app.getId())
                        .in(LeaveApplication::getStatus, List.of("PENDING", "APPROVED"))
                        .lt(LeaveApplication::getStartTime, newEnd)
                        .gt(LeaveApplication::getEndTime, app.getStartTime()));
        if (count != null && count > 0) {
            throw new BizException(ErrorCode.TIME_OVERLAP, "延长后的时间与该学生的其他请假重叠");
        }
    }

    private void log(Long applicationId, Long extensionId, String action,
                     String oldStatus, String newStatus, String comment) {
        LeaveApprovalLog row = new LeaveApprovalLog();
        row.setApplicationId(applicationId);
        row.setExtensionId(extensionId);
        row.setOperatorId(CurrentUser.requireUserId());
        row.setAction(action);
        row.setOldStatus(oldStatus);
        row.setNewStatus(newStatus);
        row.setComment(comment);
        row.setCreatedAt(LocalDateTime.now());
        approvalLogMapper.insert(row);
    }


    private static String blankTo(String s, String fallback) {
        return s == null || s.isBlank() ? fallback : s.trim();
    }
}
