package com.campusleave.student;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.*;
import com.campusleave.domain.mapper.*;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * 学生端写操作（M3 核心）。
 *
 * <p>覆盖 03_API §5.2 提交申请、§5.5 撤回、§5.6 取消、§5.7 校内确认、§5.8 GPS 销假、
 * §5.9 申请人工核验、§5.10 申请续假、§5.11 撤回续假。
 *
 * <p><b>三条贯穿全类的设计原则</b>（答辩可讲）：
 * <ol>
 *   <li><b>条件更新做状态守卫</b>：不先查后改（有并发窗口），而是
 *       {@code UPDATE ... WHERE status = 期望值}，看影响行数是否为 1。
 *       0 行说明状态已被别人改掉 → 40901「状态冲突，请刷新后重试」。</li>
 *   <li><b>完成销假必做三个副作用</b>：关闭历史 GPS 失败记录、把待核验记录置 VOID、
 *       自动撤回待审续假。三件事必须在一个事务里，否则会出现"已销假但还有待核验"的脏数据。</li>
 *   <li><b>写操作都留痕</b>：每次状态变化往 leave_approval_log 写一条，
 *       详情页时间轴和审计都靠它。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudentCommandService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 合法枚举（与 03_API 字典一致，前端下拉框同源） */
    private static final Set<String> SCENES = Set.of("OFF_CAMPUS", "ON_CAMPUS");
    private static final Set<String> TYPES = Set.of("SICK", "PERSONAL", "OTHER");
    /** 材料类型白名单：为空时落 OTHER */
    private static final Set<String> MATERIAL_TYPES = Set.of("MEDICAL_PROOF", "LEAVE_FORM", "OTHER");

    private final ClassInfoMapper classMapper;
    private final TeacherClassMapper teacherClassMapper;
    private final LeaveApplicationMapper applicationMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final LeaveMaterialMapper materialMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveApprovalLogMapper approvalLogMapper;
    private final SystemConfigMapper configMapper;
    private final StudentQueryService queryService;
    /** 销假完成的事务边界（独立 Bean，避免类内自调用导致 @Transactional 失效） */
    private final CheckinCompletionService completionService;

    // ==================== 5.2 提交申请 ====================

    /**
     * 提交请假申请。
     *
     * <p>校验顺序严格照 03_API §5.2（任一失败即返回，不做无用功）：
     * 学生资料完整 → 班级有辅导员 → 时间合法 → 不早于当前 → 无时间重叠 → 查重。
     */
    @Transactional
    public Map<String, Object> submit(SubmitApplicationRequest req) {
        StudentProfile sp = queryService.currentStudent();

        // ① 班级必须已配置辅导员，否则提交了也没人审
        ClassInfo cls = classMapper.selectById(sp.getClassId());
        if (cls == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "班级信息不存在");
        }
        TeacherClass tc = teacherClassMapper.selectOne(
                Wrappers.<TeacherClass>lambdaQuery().eq(TeacherClass::getClassId, cls.getId()));
        if (tc == null) {
            throw new BizException(ErrorCode.NO_COUNSELOR);
        }

        // ② 枚举校验：不能只靠前端下拉框，接口是可以被直接调用的。
        //    leave_scene 有 DB CHECK 兜底（会变成 500），leave_type 没有 CHECK，
        //    脏值会一路存进库并显示成"其他"，所以两者都在这里挡住。
        if (!SCENES.contains(req.getLeaveScene())) {
            throw new BizException(ErrorCode.BAD_PARAM, "请假场景只能是 OFF_CAMPUS 或 ON_CAMPUS");
        }
        if (!TYPES.contains(req.getLeaveType())) {
            throw new BizException(ErrorCode.BAD_PARAM, "请假类型只能是 SICK / PERSONAL / OTHER");
        }

        // ③ 时间解析与合法性
        LocalDateTime start = parseTime(req.getStartTime());
        LocalDateTime end = parseTime(req.getEndTime());
        LocalDateTime now = LocalDateTime.now();
        if (!end.isAfter(start)) {
            throw new BizException(ErrorCode.TIME_INVALID, "结束时间必须晚于开始时间");
        }
        if (start.isBefore(now)) {
            throw new BizException(ErrorCode.TIME_INVALID, "开始时间不能早于当前时间");
        }

        // ③ 离校必须写清去向（辅导员要知道人往哪去，安全兜底）
        if ("OFF_CAMPUS".equals(req.getLeaveScene())
                && (req.getDestination() == null || req.getDestination().trim().length() < 2)) {
            throw new BizException(ErrorCode.BAD_PARAM, "离校请假必须填写去向");
        }

        // ④ 与本人有效申请（PENDING / APPROVED）不得重叠
        //    重叠判定：start < 已有.end && end > 已有.start
        Long overlap = applicationMapper.selectCount(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, sp.getId())
                        .in(LeaveApplication::getStatus, List.of("PENDING", "APPROVED"))
                        .lt(LeaveApplication::getStartTime, end)
                        .gt(LeaveApplication::getEndTime, start));
        if (overlap != null && overlap > 0) {
            throw new BizException(ErrorCode.TIME_OVERLAP);
        }

        // ⑤ 落库（application_no 唯一，冲突时重试）
        LeaveApplication app = new LeaveApplication();
        app.setStudentId(sp.getId());
        app.setLeaveScene(req.getLeaveScene());
        app.setLeaveType(req.getLeaveType());
        app.setStartTime(start);
        app.setEndTime(end);
        app.setReason(req.getReason().trim());
        app.setDestination(req.getDestination());
        app.setContactPhone(req.getContactPhone());
        app.setStatus("PENDING");
        app.setCreatedAt(now);
        app.setUpdatedAt(now);

        insertWithRetryNo(app);

        // ⑤ 材料（选填）
        if (req.getMaterials() != null) {
            for (SubmitApplicationRequest.MaterialItem m : req.getMaterials()) {
                if (m.getFileUrl() == null || m.getFileUrl().isBlank()) continue;
                LeaveMaterial mat = new LeaveMaterial();
                mat.setApplicationId(app.getId());
                // 未知材料类型统一落 OTHER，避免把前端传来的脏值写进库
                mat.setMaterialType(MATERIAL_TYPES.contains(m.getMaterialType())
                        ? m.getMaterialType() : "OTHER");
                mat.setFileName(m.getFileName());
                mat.setFileUrl(m.getFileUrl());
                mat.setFileSize(m.getFileSize());
                mat.setMimeType(m.getMimeType());
                mat.setUploadedBy(CurrentUser.requireUserId());
                mat.setCreatedAt(now);
                materialMapper.insert(mat);
            }
        }

        writeLog(app.getId(), null, "SUBMIT", null, "PENDING", "提交申请");
        log.info("application submitted: {} by student {}", app.getApplicationNo(), sp.getId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", app.getId());
        data.put("applicationNo", app.getApplicationNo());
        data.put("status", "PENDING");
        return data;
    }

    /**
     * 生成申请编号并插入，撞唯一键时重试。
     * 编号规则：LA + yyyyMMdd + 4 位序号（当天已有条数 +1）。
     */
    private void insertWithRetryNo(LeaveApplication app) {
        String day = LocalDate.now().toString().replace("-", "");
        long base = applicationMapper.selectCount(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .likeRight(LeaveApplication::getApplicationNo, "LA" + day));

        for (int i = 0; i < 5; i++) {
            String no = String.format("LA%s%04d", day, base + 1 + i);
            app.setApplicationNo(no);
            try {
                applicationMapper.insert(app);
                return;
            } catch (DuplicateKeyException e) {
                log.warn("application_no collision, retry: {}", no);
            }
        }
        throw new BizException(ErrorCode.INTERNAL_ERROR, "生成申请编号失败，请重试");
    }

    // ==================== 5.5 撤回 ====================

    @Transactional
    public void withdraw(Long applicationId, String reason) {
        LeaveApplication app = loadOwned(applicationId);
        if (!"PENDING".equals(app.getStatus())) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "只有待审批的申请可以撤回");
        }
        // 条件更新：只有状态仍是 PENDING 才改，防并发
        int rows = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "WITHDRAWN")
                        .set(LeaveApplication::getUpdatedAt, LocalDateTime.now())
                        .eq(LeaveApplication::getId, applicationId)
                        .eq(LeaveApplication::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT);
        }
        // 撤回原因写日志（主表没有 withdraw_reason 字段，03 §5.5 R-11）
        writeLog(applicationId, null, "WITHDRAW", "PENDING", "WITHDRAWN",
                reason == null || reason.isBlank() ? "本人撤回" : reason);
    }

    // ==================== 5.6 取消 ====================

    @Transactional
    public void cancel(Long applicationId, String reason) {
        LeaveApplication app = loadOwned(applicationId);
        EffectiveStatus es = EffectiveStatus.of(app, LocalDateTime.now());
        if (!"APPROVED".equals(app.getStatus()) || es != EffectiveStatus.WAITING_START) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "只有尚未开始的已通过申请可以取消");
        }

        int rows = applicationMapper.update(null,
                Wrappers.<LeaveApplication>lambdaUpdate()
                        .set(LeaveApplication::getStatus, "CANCELLED")
                        .set(LeaveApplication::getCancelReason, reason)
                        .set(LeaveApplication::getCancelledAt, LocalDateTime.now())
                        .set(LeaveApplication::getCancelledByUserId, CurrentUser.requireUserId())
                        .set(LeaveApplication::getUpdatedAt, LocalDateTime.now())
                        .eq(LeaveApplication::getId, applicationId)
                        .eq(LeaveApplication::getStatus, "APPROVED"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT);
        }

        // 取消时若还有待审续假，一并撤回（03 §5.6）
        autoWithdrawPendingExtension(applicationId, "CANCELLED", "原申请已取消，续假自动撤回");
        writeLog(applicationId, null, "CANCEL", "APPROVED", "CANCELLED",
                reason == null || reason.isBlank() ? "本人取消" : reason);
    }

    // ==================== 5.7 校内确认结束 ====================

    /**
     * 校内确认结束（03 §5.7）。
     *
     * <p>不加 @Transactional：事务边界在 {@link CheckinCompletionService#complete}，
     * 这样"完成"与"失败记录"两条路径各自有正确的事务语义。
     */
    public Map<String, Object> checkinOnCampus(Long applicationId) {
        LeaveApplication app = loadOwned(applicationId);
        if (!"ON_CAMPUS".equals(app.getLeaveScene())) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "校内请假才能用自主确认");
        }
        return completionService.complete(app, "ON_CAMPUS_CONFIRM", null);
    }

    // ==================== 5.8 GPS 销假 ====================

    /**
     * 离校返校 GPS 销假（03 §5.8）。
     *
     * <p>距离用 Haversine 实时算（不信任前端传的"是否在校区内"）。
     *
     * <p><b>不加 @Transactional</b>：通过走事务，不通过只写一条失败记录（必须保留）。
     * 之前这个方法整体加了事务，导致超距时失败记录被回滚，学生随后申请人工核验
     * 会报「没有定位失败记录」—— 这是个真 bug，已修复。
     */
    public Map<String, Object> checkinGps(Long applicationId, Double latitude, Double longitude, Double accuracy) {
        LeaveApplication app = loadOwned(applicationId);
        if (!"OFF_CAMPUS".equals(app.getLeaveScene())) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "离校请假才能用定位销假");
        }
        if (latitude == null || longitude == null || !GeoUtil.isValid(latitude, longitude)) {
            throw new BizException(ErrorCode.BAD_PARAM, "定位坐标无效，请重新定位");
        }

        double centerLat = doubleConfig("CAMPUS_CENTER_LAT", 30.0);
        double centerLng = doubleConfig("CAMPUS_CENTER_LNG", 120.0);
        int radius = intConfig("OFF_CAMPUS_CHECK_RADIUS_M", 100);

        double distance = GeoUtil.distanceMeters(latitude, longitude, centerLat, centerLng);
        BigDecimal distanceM = BigDecimal.valueOf(distance).setScale(2, RoundingMode.HALF_UP);

        if (distance <= radius) {
            Map<String, Object> data = completionService.complete(app, "GPS", distanceM);
            data.put("passed", true);
            data.put("distanceM", distanceM);
            return data;
        }

        // 未通过：记录一条 GPS FAILED（事务外，必须保留），主状态不变
        completionService.recordGpsFailure(applicationId, distanceM);

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("passed", false);
        detail.put("distanceM", distanceM);
        detail.put("allowedRadiusM", radius);
        detail.put("options", List.of("RETRY", "MANUAL_REVIEW"));
        throw new BizException(ErrorCode.LOCATION_OUT_OF_RANGE,
                "定位距离超出允许范围（距校区 " + Math.round(distance) + " 米）", detail);
    }

    // ==================== 5.9 申请人工核验 ====================

    /**
     * 定位失败后申请人工核验。
     *
     * <p>按 D-01 决策：<b>新建一条 MANUAL_REVIEW 记录</b>，不改写原 GPS 记录。
     * 这样"驳回后再次申请"天然成立，历史也可追溯。
     */
    @Transactional
    public Map<String, Object> applyManualReview(Long applicationId, String reason, String evidenceUrl) {
        loadOwned(applicationId);

        // 前置：存在 GPS FAILED 记录
        Long failedCount = checkinLogMapper.selectCount(
                Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getApplicationId, applicationId)
                        .eq(LeaveCheckinLog::getCheckType, "GPS")
                        .eq(LeaveCheckinLog::getCheckResult, "FAILED"));
        if (failedCount == null || failedCount == 0) {
            throw new BizException(ErrorCode.CHECKIN_NOT_PROCESSABLE, "没有定位失败记录，无法申请人工核验");
        }

        // 前置：当前没有待核验记录
        Long pendingCount = checkinLogMapper.selectCount(
                Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getApplicationId, applicationId)
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"));
        if (pendingCount != null && pendingCount > 0) {
            throw new BizException(ErrorCode.CHECKIN_NOT_PROCESSABLE, "已有一条待核验记录，请等待辅导员处理");
        }

        // 取最近一条 GPS 距离，带到核验记录上（辅导员可看到"距校区 320 米"）
        LeaveCheckinLog lastGps = checkinLogMapper.selectOne(
                Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getApplicationId, applicationId)
                        .eq(LeaveCheckinLog::getCheckType, "GPS")
                        .orderByDesc(LeaveCheckinLog::getCheckTime)
                        .last("LIMIT 1"));

        LeaveCheckinLog logRow = new LeaveCheckinLog();
        logRow.setApplicationId(applicationId);
        logRow.setCheckType("MANUAL_REVIEW");
        logRow.setCheckResult("FAILED");
        logRow.setReviewStatus("PENDING_REVIEW");
        logRow.setDistanceM(lastGps == null ? null : lastGps.getDistanceM());
        logRow.setOperatorId(CurrentUser.requireUserId());
        logRow.setCheckTime(LocalDateTime.now());
        logRow.setCreatedAt(LocalDateTime.now());
        checkinLogMapper.insert(logRow);

        writeLog(applicationId, null, "MANUAL_REVIEW", null, null,
                reason == null || reason.isBlank() ? "申请人工核验" : reason);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("checkinLogId", logRow.getId());
        data.put("reviewStatus", "PENDING_REVIEW");
        return data;
    }

    // ==================== 5.10 申请续假 ====================

    @Transactional
    public Map<String, Object> applyExtension(Long applicationId, String requestedEndTime, String reason) {
        LeaveApplication app = loadOwned(applicationId);
        LocalDateTime now = LocalDateTime.now();
        EffectiveStatus es = EffectiveStatus.of(app, now);
        if (es != EffectiveStatus.IN_PROGRESS && es != EffectiveStatus.OVERDUE) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "只有请假中或逾期的申请可以续假");
        }

        LocalDateTime newEnd = parseTime(requestedEndTime);
        LocalDateTime baseline = app.getEndTime().isAfter(now) ? app.getEndTime() : now;
        if (!newEnd.isAfter(baseline)) {
            throw new BizException(ErrorCode.TIME_INVALID, "续假后的结束时间必须晚于原结束时间");
        }

        // 同一申请不能有第二条待审续假（DB 生成列唯一键兜底，这里先给友好提示）
        Long pending = extensionMapper.selectCount(
                Wrappers.<LeaveExtension>lambdaQuery()
                        .eq(LeaveExtension::getApplicationId, applicationId)
                        .eq(LeaveExtension::getStatus, "PENDING"));
        if (pending != null && pending > 0) {
            throw new BizException(ErrorCode.EXTENSION_EXISTS);
        }

        // 与本人其他有效申请不重叠（续假相当于把区间往后延，要检查冲突）
        Long overlap = applicationMapper.selectCount(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, app.getStudentId())
                        .ne(LeaveApplication::getId, applicationId)
                        .in(LeaveApplication::getStatus, List.of("PENDING", "APPROVED"))
                        .lt(LeaveApplication::getStartTime, newEnd)
                        .gt(LeaveApplication::getEndTime, app.getStartTime()));
        if (overlap != null && overlap > 0) {
            throw new BizException(ErrorCode.TIME_OVERLAP, "续假后会与另一条申请时间重叠");
        }

        LeaveExtension ext = new LeaveExtension();
        ext.setApplicationId(applicationId);
        ext.setRequestedEndTime(newEnd);
        ext.setReason(reason == null ? "续假申请" : reason);
        ext.setStatus("PENDING");
        ext.setCreatedAt(now);
        ext.setUpdatedAt(now);
        try {
            extensionMapper.insert(ext);
        } catch (DuplicateKeyException e) {
            // 生成列唯一键命中：并发下第二条待审续假
            throw new BizException(ErrorCode.EXTENSION_EXISTS);
        }

        writeLog(applicationId, ext.getId(), "EXTENSION_SUBMIT", null, null,
                "申请续假至 " + newEnd.format(DT));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", ext.getId());
        data.put("status", "PENDING");
        return data;
    }

    // ==================== 5.11 撤回续假 ====================

    @Transactional
    public void withdrawExtension(Long extensionId, String reason) {
        LeaveExtension ext = extensionMapper.selectById(extensionId);
        if (ext == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        loadOwned(ext.getApplicationId());   // 越权防护

        if (!"PENDING".equals(ext.getStatus())) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "只有待审批的续假可以撤回");
        }
        int rows = extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "WITHDRAWN")
                        .set(LeaveExtension::getWithdrawReason, reason)
                        .set(LeaveExtension::getWithdrawnAt, LocalDateTime.now())
                        .set(LeaveExtension::getWithdrawnBy, CurrentUser.requireUserId())
                        .set(LeaveExtension::getUpdatedAt, LocalDateTime.now())
                        .eq(LeaveExtension::getId, extensionId)
                        .eq(LeaveExtension::getStatus, "PENDING"));
        if (rows != 1) {
            throw new BizException(ErrorCode.STATUS_CONFLICT);
        }
        writeLog(ext.getApplicationId(), extensionId, "EXTENSION_WITHDRAW", null, null,
                reason == null || reason.isBlank() ? "本人撤回续假" : reason);
    }

    /** 自动撤回该申请下所有 PENDING 续假，返回受影响条数 */
    private int autoWithdrawPendingExtension(Long applicationId, String reasonCode, String reason) {
        return extensionMapper.update(null,
                Wrappers.<LeaveExtension>lambdaUpdate()
                        .set(LeaveExtension::getStatus, "WITHDRAWN")
                        .set(LeaveExtension::getWithdrawReason, reason)
                        .set(LeaveExtension::getWithdrawnAt, LocalDateTime.now())
                        .set(LeaveExtension::getUpdatedAt, LocalDateTime.now())
                        .eq(LeaveExtension::getApplicationId, applicationId)
                        .eq(LeaveExtension::getStatus, "PENDING"));
    }

    // ==================== 工具 ====================

    /** 取申请并校验归属：学生只能操作自己的 */
    private LeaveApplication loadOwned(Long applicationId) {
        StudentProfile sp = queryService.currentStudent();
        LeaveApplication app = applicationMapper.selectById(applicationId);
        if (app == null || !Objects.equals(app.getStudentId(), sp.getId())) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        return app;
    }

    private LocalDateTime parseTime(String s) {
        try {
            return LocalDateTime.parse(s.trim(), DT);
        } catch (DateTimeParseException e) {
            throw new BizException(ErrorCode.TIME_INVALID, "时间格式应为 yyyy-MM-dd HH:mm:ss");
        }
    }

    private void writeLog(Long applicationId, Long extensionId, String action,
                          String oldStatus, String newStatus, String comment) {
        LeaveApprovalLog logRow = new LeaveApprovalLog();
        logRow.setApplicationId(applicationId);
        logRow.setExtensionId(extensionId);
        logRow.setOperatorId(CurrentUser.requireUserId());
        logRow.setAction(action);
        logRow.setOldStatus(oldStatus);
        logRow.setNewStatus(newStatus);
        logRow.setComment(comment);
        logRow.setCreatedAt(LocalDateTime.now());
        approvalLogMapper.insert(logRow);
    }

    private double doubleConfig(String key, double def) {
        SystemConfig c = configMapper.selectOne(
                Wrappers.<SystemConfig>lambdaQuery().eq(SystemConfig::getConfigKey, key));
        if (c == null || c.getConfigValue() == null) return def;
        try {
            return Double.parseDouble(c.getConfigValue());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private int intConfig(String key, int def) {
        return (int) doubleConfig(key, def);
    }
}
