package com.campusleave.teacher;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.common.PageResult;
import com.campusleave.domain.entity.*;
import com.campusleave.domain.mapper.*;
import com.campusleave.security.CurrentUser;
import com.campusleave.student.EffectiveStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 教师端查询服务（03_API §6.1 – §6.14 的 GET 部分）。
 *
 * <p><b>返回结构刻意与 admin/js/mock.js 同构</b>：
 * scene / type 直接给中文（"离校" / "病假"），时间是 "yyyy-MM-dd HH:mm" 字符串。
 * 这样一来前端只需要把 MOCK.apps 换成接口结果，页面代码一行不用动。
 * 这不是偷懒 —— Web 后台是纯展示层，后端直接产出视图模型比让前端做一堆
 * 枚举翻译更省事，也避免了"小程序要枚举、后台要中文"两套格式打架。
 *
 * <p>所有列表查询都先经 {@link TeacherScopeService} 拿班级/学生范围，
 * 再拼 IN 条件；范围为空时直接返回空页，不查库。
 */
@Service
@RequiredArgsConstructor
public class TeacherQueryService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final TeacherScopeService scope;
    private final UserMapper userMapper;
    private final StudentProfileMapper studentMapper;
    private final ClassInfoMapper classMapper;
    private final LeaveApplicationMapper applicationMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final LeaveMaterialMapper materialMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveApprovalLogMapper approvalLogMapper;

    // ==================== 6.1 工作台 ====================

    /**
     * 工作台：三个计数 + 待办列表。
     *
     * <p>待办只取"待审批申请"和"待核验销假"两类 —— 逾期不是动作，是状态，
     * 放在计数里提示即可，不塞进待办，否则教师会以为有事要做。
     */
    public Map<String, Object> workbench() {
        List<Long> studentIds = scope.studentIds();
        LocalDateTime now = LocalDateTime.now();

        if (studentIds.isEmpty()) {
            return Map.of(
                    "pendingCount", 0, "inProgressCount", 0, "abnormalCount", 0,
                    "todos", List.of(), "pendingExtensionCount", 0, "overdueCount", 0);
        }

        List<LeaveApplication> all = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery().in(LeaveApplication::getStudentId, studentIds));

        int pending = 0, inProgress = 0, overdue = 0;
        List<Map<String, Object>> todos = new ArrayList<>();
        Map<Long, StudentProfile> spMap = scope.studentMap(studentIds);
        Map<Long, User> userMap = userMap(spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList()));
        Map<Long, String> clsMap = scope.classNames();

        for (LeaveApplication a : all) {
            EffectiveStatus es = EffectiveStatus.of(a, now);
            if (es == EffectiveStatus.IN_PROGRESS) inProgress++;
            if (es == EffectiveStatus.OVERDUE) overdue++;
            if (es == EffectiveStatus.PENDING) {
                pending++;
                if (todos.size() < 8) {
                    todos.add(todo(a, "APPLICATION", spMap.get(a.getStudentId()), userMap, "待审批"));
                }
            }
        }

        // 待核验销假：独立于申请状态，按 checkin_log 统计
        List<LeaveCheckinLog> toReview = checkinLogMapper.selectList(
                Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW")
                        .orderByDesc(LeaveCheckinLog::getCheckTime));
        List<LeaveCheckinLog> mineReview = toReview.stream()
                .filter(c -> all.stream().anyMatch(a -> a.getId().equals(c.getApplicationId())))
                .collect(Collectors.toList());
        for (LeaveCheckinLog c : mineReview) {
            if (todos.size() >= 12) break;
            LeaveApplication a = all.stream()
                    .filter(x -> x.getId().equals(c.getApplicationId())).findFirst().orElse(null);
            if (a == null) continue;
            Map<String, Object> t = todo(a, "CHECKIN", spMap.get(a.getStudentId()), userMap, "待核验销假");
            t.put("checkinId", c.getId());
            t.put("distanceM", c.getDistanceM());
            todos.add(t);
        }

        long pendingExt = all.isEmpty() ? 0 : extensionMapper.selectCount(
                Wrappers.<LeaveExtension>lambdaQuery()
                        .eq(LeaveExtension::getStatus, "PENDING")
                        .in(LeaveExtension::getApplicationId,
                                all.stream().map(LeaveApplication::getId).collect(Collectors.toList())));

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("pendingCount", pending);
        r.put("inProgressCount", inProgress);
        r.put("abnormalCount", mineReview.size());
        r.put("overdueCount", overdue);
        r.put("pendingExtensionCount", pendingExt);
        r.put("todos", todos);
        return r;
    }

    private Map<String, Object> todo(LeaveApplication a, String type,
                                     StudentProfile sp, Map<Long, User> userMap, String tag) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("type", type);
        t.put("id", a.getId());
        t.put("studentName", nameOf(sp, userMap));
        t.put("summary", sceneLabel(a.getLeaveScene()) + " · " + typeLabel(a.getLeaveType()));
        t.put("timeRange", DT.format(a.getStartTime()) + " — " + DT.format(a.getEndTime()));
        t.put("tag", tag);
        return t;
    }

    // ==================== 6.2 申请列表 ====================

    /**
     * 待审批 / 记录列表。
     *
     * @param tab       pending（只查 PENDING，按提交时间升序）| records（全状态，按提交时间降序）
     * @param status    持久状态筛选（records 用；传 ACTIVE 表示"请假中+逾期"）
     * @param classId   班级筛选（必须在自己负责范围内）
     * @param keyword   学生姓名 / 学号
     * @param startDate 提交日期起（yyyy-MM-dd）
     * @param endDate   提交日期止（yyyy-MM-dd）
     */
    public PageResult<Map<String, Object>> applications(String tab, String status, Long classId,
                                                        String keyword, String startDate, String endDate,
                                                        int page, int size) {
        List<Long> students = filterStudents(classId, keyword);
        if (students.isEmpty()) {
            return new PageResult<>(List.of(), 0, page, size);
        }

        var q = Wrappers.<LeaveApplication>lambdaQuery()
                .in(LeaveApplication::getStudentId, students);

        boolean pendingTab = "pending".equalsIgnoreCase(tab);
        if (pendingTab) {
            q.eq(LeaveApplication::getStatus, "PENDING").orderByAsc(LeaveApplication::getCreatedAt);
        } else {
            if (status != null && !status.isBlank()) {
                if ("ACTIVE".equals(status)) {
                    // 计算态没有持久列，交给内存过滤（数据量在学院量级，可接受）
                    q.eq(LeaveApplication::getStatus, "APPROVED")
                            .isNull(LeaveApplication::getActualEndTime);
                } else {
                    q.eq(LeaveApplication::getStatus, status);
                }
            }
            if (startDate != null && !startDate.isBlank()) {
                q.ge(LeaveApplication::getCreatedAt, LocalDateTime.parse(startDate + "T00:00:00"));
            }
            if (endDate != null && !endDate.isBlank()) {
                q.lt(LeaveApplication::getCreatedAt, LocalDateTime.parse(endDate + "T00:00:00").plusDays(1));
            }
            q.orderByDesc(LeaveApplication::getCreatedAt);
        }

        Page<LeaveApplication> p = applicationMapper.selectPage(new Page<>(page, size), q);
        List<Map<String, Object>> rows = enrich(p.getRecords(), LocalDateTime.now());
        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    /** 把申请实体批量补成前端要的行结构（一次查齐学生/班级/材料/续假/核验，避免 N+1） */
    public List<Map<String, Object>> enrich(List<LeaveApplication> apps, LocalDateTime now) {
        if (apps.isEmpty()) return List.of();

        List<Long> appIds = apps.stream().map(LeaveApplication::getId).collect(Collectors.toList());
        List<Long> studentIds = apps.stream().map(LeaveApplication::getStudentId).distinct().collect(Collectors.toList());

        Map<Long, StudentProfile> spMap = scope.studentMap(studentIds);
        Map<Long, User> userMap = userMap(spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList()));
        Map<Long, String> clsMap = scope.classNames();

        Map<Long, List<LeaveMaterial>> matMap = materialMapper.selectList(
                        Wrappers.<LeaveMaterial>lambdaQuery().in(LeaveMaterial::getApplicationId, appIds))
                .stream().collect(Collectors.groupingBy(LeaveMaterial::getApplicationId));

        Map<Long, List<LeaveCheckinLog>> chkMap = checkinLogMapper.selectList(
                        Wrappers.<LeaveCheckinLog>lambdaQuery().in(LeaveCheckinLog::getApplicationId, appIds)
                                .orderByDesc(LeaveCheckinLog::getCheckTime))
                .stream().collect(Collectors.groupingBy(LeaveCheckinLog::getApplicationId));

        Set<Long> pendingExtAppIds = extensionMapper.selectList(
                        Wrappers.<LeaveExtension>lambdaQuery()
                                .in(LeaveExtension::getApplicationId, appIds)
                                .eq(LeaveExtension::getStatus, "PENDING"))
                .stream().map(LeaveExtension::getApplicationId).collect(Collectors.toSet());

        // 驳回原因：取最近一条 REJECT 日志
        Map<Long, String> rejectMap = new HashMap<>();
        approvalLogMapper.selectList(
                        Wrappers.<LeaveApprovalLog>lambdaQuery()
                                .in(LeaveApprovalLog::getApplicationId, appIds)
                                .eq(LeaveApprovalLog::getAction, "REJECT")
                                .orderByDesc(LeaveApprovalLog::getCreatedAt))
                .forEach(l -> rejectMap.putIfAbsent(l.getApplicationId(), l.getComment()));

        List<Map<String, Object>> out = new ArrayList<>(apps.size());
        for (LeaveApplication a : apps) {
            StudentProfile sp = spMap.get(a.getStudentId());
            User u = sp == null ? null : userMap.get(sp.getUserId());
            List<LeaveCheckinLog> chks = chkMap.getOrDefault(a.getId(), List.of());

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", a.getId());
            r.put("no", a.getApplicationNo());
            r.put("studentId", a.getStudentId());
            r.put("studentNo", sp == null ? "" : sp.getStudentNo());
            r.put("studentName", u == null ? "" : u.getRealName());
            r.put("className", sp == null ? "" : clsMap.getOrDefault(sp.getClassId(), ""));
            r.put("phone", nz(a.getContactPhone()));
            r.put("emergencyContact", sp == null ? ""
                    : nz(sp.getEmergencyContact()) + (nz(sp.getEmergencyPhone()).isEmpty() ? "" : " " + sp.getEmergencyPhone()));
            r.put("scene", sceneLabel(a.getLeaveScene()));
            r.put("type", typeLabel(a.getLeaveType()));
            r.put("start", DT.format(a.getStartTime()));
            r.put("end", DT.format(a.getEndTime()));
            r.put("status", a.getStatus());
            r.put("effective", EffectiveStatus.of(a, now).name());
            r.put("reason", nz(a.getReason()));
            r.put("destination", nz(a.getDestination()));
            r.put("submittedAt", a.getCreatedAt() == null ? "" : DT.format(a.getCreatedAt()));
            r.put("approvedBy", "");
            r.put("approvedAt", a.getApprovedAt() == null ? "" : DT.format(a.getApprovedAt()));
            r.put("rejectReason", rejectMap.getOrDefault(a.getId(), ""));
            r.put("actualEnd", a.getActualEndTime() == null ? "" : DT.format(a.getActualEndTime()));
            r.put("pendingExtension", pendingExtAppIds.contains(a.getId()));
            r.put("materials", chks.isEmpty() && matMap.get(a.getId()) == null
                    ? List.of() : materials(matMap.getOrDefault(a.getId(), List.of())));
            r.put("checkins", chks.stream().map(this::checkinRow).collect(Collectors.toList()));

            List<String> actions = new ArrayList<>();
            if ("PENDING".equals(a.getStatus())) actions.add("APPROVE");
            if (chks.stream().anyMatch(c -> "PENDING_REVIEW".equals(c.getReviewStatus()))) actions.add("REVIEW");
            r.put("actions", actions);

            out.add(r);
        }
        return out;
    }

    private List<Map<String, Object>> materials(List<LeaveMaterial> list) {
        return list.stream().map(m -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", m.getId());
            x.put("name", fileName(m.getFileUrl()));
            x.put("type", typeLabel(m.getMaterialType()));
            x.put("size", humanSize(m.getFileSize()));
            x.put("url", m.getFileUrl());
            return x;
        }).collect(Collectors.toList());
    }

    private Map<String, Object> checkinRow(LeaveCheckinLog c) {
        Map<String, Object> x = new LinkedHashMap<>();
        x.put("id", c.getId());
        x.put("type", c.getCheckType());
        x.put("result", c.getCheckResult());
        x.put("review", c.getReviewStatus());
        x.put("time", c.getCheckTime() == null ? "" : DT.format(c.getCheckTime()));
        x.put("distance", c.getDistanceM());
        x.put("note", checkinNote(c));
        x.put("closedAt", c.getClosedAt() == null ? "" : DT.format(c.getClosedAt()));
        x.put("reviewComment", nz(c.getReviewComment()));
        return x;
    }

    private String checkinNote(LeaveCheckinLog c) {
        if ("GPS".equals(c.getCheckType())) {
            if ("PASSED".equals(c.getCheckResult())) {
                return "已回到校区（" + (c.getDistanceM() == null ? "0" : c.getDistanceM().stripTrailingZeros().toPlainString()) + " 米）";
            }
            return "不在校区范围（" + (c.getDistanceM() == null ? "?" : c.getDistanceM().stripTrailingZeros().toPlainString()) + " 米）";
        }
        if ("ON_CAMPUS_CONFIRM".equals(c.getCheckType())) return "学生自主确认结束";
        return "学生提交人工核验申请";
    }

    // ==================== 6.3 申请详情 ====================

    public Map<String, Object> applicationDetail(Long id) {
        LeaveApplication a = mustInScope(id);
        Map<String, Object> r = enrich(List.of(a), LocalDateTime.now()).get(0);

        // 详情多给的：审批记录时间线
        List<Map<String, Object>> logs = approvalLogMapper.selectList(
                        Wrappers.<LeaveApprovalLog>lambdaQuery()
                                .eq(LeaveApprovalLog::getApplicationId, id)
                                .orderByAsc(LeaveApprovalLog::getCreatedAt))
                .stream().map(l -> {
                    Map<String, Object> x = new LinkedHashMap<>();
                    x.put("action", l.getAction());
                    x.put("oldStatus", l.getOldStatus());
                    x.put("newStatus", l.getNewStatus());
                    x.put("comment", nz(l.getComment()));
                    x.put("at", l.getCreatedAt() == null ? "" : DT.format(l.getCreatedAt()));
                    x.put("operator", l.getOperatorId() == null ? "" : operatorName(l.getOperatorId()));
                    return x;
                }).collect(Collectors.toList());
        r.put("logs", logs);

        // 续假记录
        List<LeaveExtension> exts = extensionMapper.selectList(
                Wrappers.<LeaveExtension>lambdaQuery()
                        .eq(LeaveExtension::getApplicationId, id)
                        .orderByDesc(LeaveExtension::getCreatedAt));
        r.put("extensions", exts.stream().map(e -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", e.getId());
            x.put("requestedEnd", DT.format(e.getRequestedEndTime()));
            x.put("reason", nz(e.getReason()));
            x.put("status", e.getStatus());
            x.put("comment", nz(e.getReviewComment()));
            x.put("at", e.getCreatedAt() == null ? "" : DT.format(e.getCreatedAt()));
            return x;
        }).collect(Collectors.toList()));

        // 审批人姓名
        if (a.getApprovedByUserId() != null) {
            r.put("approvedBy", operatorName(a.getApprovedByUserId()));
        }
        return r;
    }

    private String operatorName(Long userId) {
        User u = userMapper.selectById(userId);
        return u == null ? "" : u.getRealName();
    }

    // ==================== 6.6 续假列表 / 详情 ====================

    public PageResult<Map<String, Object>> extensions(String status, int page, int size) {
        List<Long> students = scope.studentIds();
        if (students.isEmpty()) return new PageResult<>(List.of(), 0, page, size);

        List<Long> appIds = applicationMapper.selectList(
                        Wrappers.<LeaveApplication>lambdaQuery().in(LeaveApplication::getStudentId, students))
                .stream().map(LeaveApplication::getId).collect(Collectors.toList());
        if (appIds.isEmpty()) return new PageResult<>(List.of(), 0, page, size);

        var q = Wrappers.<LeaveExtension>lambdaQuery().in(LeaveExtension::getApplicationId, appIds);
        if (status != null && !status.isBlank()) q.eq(LeaveExtension::getStatus, status);
        q.orderByDesc(LeaveExtension::getCreatedAt);

        Page<LeaveExtension> p = extensionMapper.selectPage(new Page<>(page, size), q);
        // 空页直接返回：MyBatis-Plus 的 selectBatchIds / in() 不接受空集合
        if (p.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), p.getTotal(), page, size);
        }
        Map<Long, LeaveApplication> appMap = applicationMapper.selectBatchIds(
                        p.getRecords().stream().map(LeaveExtension::getApplicationId).distinct().collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(LeaveApplication::getId, x -> x));
        Map<Long, StudentProfile> spMap = scope.studentMap(
                appMap.values().stream().map(LeaveApplication::getStudentId).distinct().collect(Collectors.toList()));
        Map<Long, User> userMap = userMap(spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList()));
        Map<Long, String> clsMap = scope.classNames();

        List<Map<String, Object>> rows = p.getRecords().stream().map(e -> {
            LeaveApplication a = appMap.get(e.getApplicationId());
            StudentProfile sp = a == null ? null : spMap.get(a.getStudentId());
            User u = sp == null ? null : userMap.get(sp.getUserId());
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", e.getId());
            x.put("applicationId", e.getApplicationId());
            x.put("studentName", u == null ? "" : u.getRealName());
            x.put("className", sp == null ? "" : clsMap.getOrDefault(sp.getClassId(), ""));
            x.put("scene", a == null ? "" : sceneLabel(a.getLeaveScene()));
            x.put("type", a == null ? "" : typeLabel(a.getLeaveType()));
            x.put("originEnd", a == null ? "" : DT.format(a.getEndTime()));
            x.put("requestedEnd", DT.format(e.getRequestedEndTime()));
            x.put("reason", nz(e.getReason()));
            x.put("submittedAt", e.getCreatedAt() == null ? "" : DT.format(e.getCreatedAt()));
            x.put("status", e.getStatus());
            x.put("comment", nz(e.getReviewComment()));
            return x;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    public Map<String, Object> extensionDetail(Long id) {
        LeaveExtension e = extensionMapper.selectById(id);
        if (e == null) throw new BizException(ErrorCode.NOT_FOUND, "续假申请不存在");
        LeaveApplication a = mustInScope(e.getApplicationId());
        Map<String, Object> x = new LinkedHashMap<>();
        x.put("id", e.getId());
        x.put("applicationId", e.getApplicationId());
        x.put("originEnd", DT.format(a.getEndTime()));
        x.put("requestedEnd", DT.format(e.getRequestedEndTime()));
        x.put("reason", nz(e.getReason()));
        x.put("status", e.getStatus());
        x.put("comment", nz(e.getReviewComment()));
        x.put("submittedAt", e.getCreatedAt() == null ? "" : DT.format(e.getCreatedAt()));
        x.put("application", applicationDetail(a.getId()));
        return x;
    }

    // ==================== 6.9 核验列表 / 详情 ====================

    public PageResult<Map<String, Object>> checkinLogs(String reviewStatus, String checkResult, int page, int size) {
        List<Long> students = scope.studentIds();
        if (students.isEmpty()) return new PageResult<>(List.of(), 0, page, size);
        List<Long> appIds = applicationMapper.selectList(
                        Wrappers.<LeaveApplication>lambdaQuery().in(LeaveApplication::getStudentId, students))
                .stream().map(LeaveApplication::getId).collect(Collectors.toList());
        if (appIds.isEmpty()) return new PageResult<>(List.of(), 0, page, size);

        var q = Wrappers.<LeaveCheckinLog>lambdaQuery().in(LeaveCheckinLog::getApplicationId, appIds);
        if (reviewStatus != null && !reviewStatus.isBlank()) q.eq(LeaveCheckinLog::getReviewStatus, reviewStatus);
        if (checkResult != null && !checkResult.isBlank()) q.eq(LeaveCheckinLog::getCheckResult, checkResult);
        q.orderByDesc(LeaveCheckinLog::getCheckTime);

        Page<LeaveCheckinLog> p = checkinLogMapper.selectPage(new Page<>(page, size), q);
        if (p.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), p.getTotal(), page, size);
        }
        Map<Long, LeaveApplication> appMap = applicationMapper.selectBatchIds(
                        p.getRecords().stream().map(LeaveCheckinLog::getApplicationId).distinct().collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(LeaveApplication::getId, x -> x));
        Map<Long, StudentProfile> spMap = scope.studentMap(
                appMap.values().stream().map(LeaveApplication::getStudentId).distinct().collect(Collectors.toList()));
        Map<Long, User> userMap = userMap(spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList()));

        List<Map<String, Object>> rows = p.getRecords().stream().map(c -> {
            LeaveApplication a = appMap.get(c.getApplicationId());
            StudentProfile sp = a == null ? null : spMap.get(a.getStudentId());
            Map<String, Object> x = checkinRow(c);
            x.put("applicationId", c.getApplicationId());
            x.put("studentName", nameOf(sp, userMap));
            x.put("studentNo", sp == null ? "" : sp.getStudentNo());
            x.put("summary", a == null ? "" : sceneLabel(a.getLeaveScene()) + " · " + typeLabel(a.getLeaveType()));
            x.put("reviewedAt", c.getReviewedAt() == null ? "" : DT.format(c.getReviewedAt()));
            return x;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    public Map<String, Object> checkinDetail(Long id) {
        LeaveCheckinLog c = checkinLogMapper.selectById(id);
        if (c == null) throw new BizException(ErrorCode.NOT_FOUND, "核验记录不存在");
        LeaveApplication a = mustInScope(c.getApplicationId());

        Map<String, Object> x = checkinRow(c);
        x.put("applicationId", c.getApplicationId());
        x.put("application", enrich(List.of(a), LocalDateTime.now()).get(0));
        // 同申请的其他销假尝试，教师判断时能看到完整经过
        x.put("history", checkinLogMapper.selectList(
                        Wrappers.<LeaveCheckinLog>lambdaQuery()
                                .eq(LeaveCheckinLog::getApplicationId, c.getApplicationId())
                                .orderByAsc(LeaveCheckinLog::getCheckTime))
                .stream().map(this::checkinRow).collect(Collectors.toList()));
        return x;
    }

    // ==================== 6.12 逾期 ====================

    public PageResult<Map<String, Object>> overdue(Long classId, int page, int size) {
        List<Long> students = filterStudents(classId, null);
        if (students.isEmpty()) return new PageResult<>(List.of(), 0, page, size);

        LocalDateTime now = LocalDateTime.now();
        Page<LeaveApplication> p = applicationMapper.selectPage(new Page<>(page, size),
                Wrappers.<LeaveApplication>lambdaQuery()
                        .in(LeaveApplication::getStudentId, students)
                        .eq(LeaveApplication::getStatus, "APPROVED")
                        .isNull(LeaveApplication::getActualEndTime)
                        .le(LeaveApplication::getEndTime, now)
                        .orderByAsc(LeaveApplication::getEndTime));

        return new PageResult<>(enrich(p.getRecords(), now), p.getTotal(), page, size);
    }

    // ==================== 6.13 学生列表 / 详情 ====================

    public PageResult<Map<String, Object>> students(String keyword, Long classId, int page, int size) {
        List<Long> ids = filterStudents(classId, keyword);
        if (ids.isEmpty()) return new PageResult<>(List.of(), 0, page, size);

        Page<StudentProfile> p = studentMapper.selectPage(new Page<>(page, size),
                Wrappers.<StudentProfile>lambdaQuery().in(StudentProfile::getId, ids)
                        .orderByAsc(StudentProfile::getStudentNo));
        if (p.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), p.getTotal(), page, size);
        }

        Map<Long, User> userMap = userMap(p.getRecords().stream().map(StudentProfile::getUserId).collect(Collectors.toList()));
        Map<Long, String> clsMap = scope.classNames();
        Map<Long, List<LeaveApplication>> byStudent = applicationMapper.selectList(
                        Wrappers.<LeaveApplication>lambdaQuery()
                                .in(LeaveApplication::getStudentId, p.getRecords().stream().map(StudentProfile::getId).collect(Collectors.toList())))
                .stream().collect(Collectors.groupingBy(LeaveApplication::getStudentId));

        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> rows = p.getRecords().stream().map(sp -> {
            List<LeaveApplication> apps = byStudent.getOrDefault(sp.getId(), List.of());
            long approved = apps.stream().filter(x -> !"PENDING".equals(x.getStatus())
                    && !"REJECTED".equals(x.getStatus()) && !"WITHDRAWN".equals(x.getStatus())
                    && !"CANCELLED".equals(x.getStatus())).count();
            long completed = apps.stream().filter(x -> "COMPLETED".equals(x.getStatus())).count();
            EffectiveStatus cur = apps.stream().map(x -> EffectiveStatus.of(x, now))
                    .filter(e -> e == EffectiveStatus.PENDING || e == EffectiveStatus.IN_PROGRESS
                            || e == EffectiveStatus.OVERDUE || e == EffectiveStatus.WAITING_START)
                    .findFirst().orElse(null);
            User u = userMap.get(sp.getUserId());

            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", sp.getId());
            x.put("no", sp.getStudentNo());
            x.put("name", u == null ? "" : u.getRealName());
            x.put("cls", clsMap.getOrDefault(sp.getClassId(), ""));
            x.put("phone", u == null ? "" : nz(u.getPhone()));
            x.put("total", apps.size());
            x.put("approved", approved);
            x.put("completed", completed);
            x.put("current", cur == null ? "—" : statusWord(cur));
            return x;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    public Map<String, Object> studentDetail(Long id) {
        StudentProfile sp = studentMapper.selectById(id);
        if (sp == null) throw new BizException(ErrorCode.NOT_FOUND, "学生不存在");
        scope.assertStudentInScope(id);

        User u = userMapper.selectById(sp.getUserId());
        List<LeaveApplication> apps = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, id)
                        .orderByDesc(LeaveApplication::getCreatedAt));
        LocalDateTime now = LocalDateTime.now();

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", sp.getId());
        r.put("no", sp.getStudentNo());
        r.put("name", u == null ? "" : u.getRealName());
        r.put("cls", scope.classNames().getOrDefault(sp.getClassId(), ""));
        r.put("phone", u == null ? "" : nz(u.getPhone()));
        r.put("emergencyContact", nz(sp.getEmergencyContact()) + " " + nz(sp.getEmergencyPhone()));
        r.put("stats", statsOf(apps, now));
        r.put("recent", enrich(apps.stream().limit(10).collect(Collectors.toList()), now));
        return r;
    }

    // ==================== 6.14 统计 ====================

    public Map<String, Object> stats(Long classId) {
        List<Long> students = filterStudents(classId, null);
        if (students.isEmpty()) {
            return Map.of("totalApplications", 0, "approved", 0, "completed", 0, "currentOverdue", 0);
        }
        List<LeaveApplication> apps = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery().in(LeaveApplication::getStudentId, students));
        return statsOf(apps, LocalDateTime.now());
    }

    private Map<String, Object> statsOf(List<LeaveApplication> apps, LocalDateTime now) {
        long approved = apps.stream()
                .filter(x -> Set.of("APPROVED", "COMPLETED").contains(x.getStatus())).count();
        long completed = apps.stream().filter(x -> "COMPLETED".equals(x.getStatus())).count();
        long overdue = apps.stream().filter(x -> EffectiveStatus.of(x, now) == EffectiveStatus.OVERDUE).count();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalApplications", apps.size());
        m.put("approved", approved);
        m.put("completed", completed);
        m.put("currentOverdue", overdue);
        return m;
    }

    // ==================== 内部工具 ====================

    /** 班级 + 关键字 → 学生 id 列表（已经和负责范围求过交集） */
    private List<Long> filterStudents(Long classId, String keyword) {
        List<Long> scoped = classId == null ? scope.studentIds() : studentsOfClass(classId);
        if (scoped.isEmpty()) return List.of();
        if (keyword == null || keyword.isBlank()) return scoped;

        String kw = keyword.trim();
        Set<Long> hit = new HashSet<>();
        studentMapper.selectList(Wrappers.<StudentProfile>lambdaQuery()
                        .in(StudentProfile::getId, scoped)
                        .like(StudentProfile::getStudentNo, kw))
                .forEach(s -> hit.add(s.getId()));
        userMapper.selectList(Wrappers.<User>lambdaQuery().like(User::getRealName, kw))
                .forEach(u -> studentMapper.selectList(Wrappers.<StudentProfile>lambdaQuery()
                                .in(StudentProfile::getId, scoped)
                                .eq(StudentProfile::getUserId, u.getId()))
                        .forEach(s -> hit.add(s.getId())));
        return new ArrayList<>(hit);
    }

    private List<Long> studentsOfClass(Long classId) {
        List<Long> allowed = scope.resolveClassFilter(classId);
        if (allowed.isEmpty()) return List.of();
        return studentMapper.selectList(Wrappers.<StudentProfile>lambdaQuery()
                        .in(StudentProfile::getClassId, allowed))
                .stream().map(StudentProfile::getId).collect(Collectors.toList());
    }

    private LeaveApplication mustInScope(Long appId) {
        LeaveApplication a = applicationMapper.selectById(appId);
        if (a == null) throw new BizException(ErrorCode.NOT_FOUND, "申请不存在");
        scope.assertStudentInScope(a.getStudentId());
        return a;
    }

    public Map<Long, User> userMap(List<Long> userIds) {
        List<Long> ids = userIds.stream().filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (ids.isEmpty()) return Map.of();
        return userMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));
    }

    private String nameOf(StudentProfile sp, Map<Long, User> userMap) {
        if (sp == null) return "";
        User u = userMap.get(sp.getUserId());
        return u == null ? "" : u.getRealName();
    }

    public static String sceneLabel(String scene) {
        return "OFF_CAMPUS".equals(scene) ? "离校" : "校内";
    }

    public static String typeLabel(String type) {
        if ("SICK".equals(type)) return "病假";
        if ("PERSONAL".equals(type)) return "事假";
        return "其他";
    }

    public static String statusWord(EffectiveStatus es) {
        return switch (es) {
            case PENDING -> "待审批";
            case WAITING_START -> "待开始";
            case IN_PROGRESS -> "请假中";
            case OVERDUE -> "逾期";
            case COMPLETED -> "已销假";
            case REJECTED -> "已驳回";
            case WITHDRAWN -> "已撤回";
            case CANCELLED -> "已取消";
        };
    }

    private static String fileName(String url) {
        if (url == null) return "";
        int i = url.lastIndexOf('/');
        return i == -1 ? url : url.substring(i + 1);
    }

    private static String humanSize(Long bytes) {
        if (bytes == null || bytes <= 0) return "";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.0f KB", bytes / 1024.0);
        return String.format("%.1f MB", bytes / 1024.0 / 1024.0);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
