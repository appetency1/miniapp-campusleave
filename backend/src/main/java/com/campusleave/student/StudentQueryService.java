package com.campusleave.student;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.*;
import com.campusleave.domain.mapper.*;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 学生端查询服务（M2 范围：只读，不涉及写操作）。
 *
 * <p>对应 03_API §5.1 首页总览 / §5.3 申请列表 / §5.4 详情 / §5.12 消息 / §5.13 统计。
 * 写操作（提交、销假、撤回等）在 M3 实现。
 *
 * <p><b>数据范围</b>：所有方法都以 {@code CurrentUser.requireUserId()} 为起点，
 * 通过 student_profile.user_id 反查学生，再限定 application.student_id —— 
 * 学生永远只能看到自己的数据，不依赖前端传参。
 */
@Service
@RequiredArgsConstructor
public class StudentQueryService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final StudentProfileMapper studentMapper;
    private final ClassInfoMapper classMapper;
    private final TeacherClassMapper teacherClassMapper;
    private final TeacherProfileMapper teacherProfileMapper;
    private final UserMapper userMapper;
    private final LeaveApplicationMapper applicationMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final LeaveMaterialMapper materialMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveApprovalLogMapper approvalLogMapper;
    private final NotificationMapper notificationMapper;

    // ==================== 基础：当前学生 ====================

    /**
     * 取当前登录学生。学生身份 = user + student_profile 两层，
     * 小程序端所有接口都要先过这一层。
     */
    public StudentProfile currentStudent() {
        Long userId = CurrentUser.requireUserId();
        StudentProfile sp = studentMapper.selectOne(
                Wrappers.<StudentProfile>lambdaQuery().eq(StudentProfile::getUserId, userId));
        if (sp == null) {
            // 账号存在但没有学籍档案：属于数据配置问题，不是权限问题
            throw new BizException(ErrorCode.NOT_FOUND, "学生档案不存在，请联系管理员");
        }
        return sp;
    }

    /** 班级信息（用于首页头部「计算机2301班」） */
    private ClassInfo classOf(StudentProfile sp) {
        return classMapper.selectById(sp.getClassId());
    }

    /**
     * 辅导员姓名。路径：class_id → teacher_class → teacher_profile → user.real_name。
     * 班级未绑定辅导员时返回 null（前端整段隐藏）。
     */
    public String counselorName(Long classId) {
        TeacherClass tc = teacherClassMapper.selectOne(
                Wrappers.<TeacherClass>lambdaQuery().eq(TeacherClass::getClassId, classId));
        if (tc == null) {
            return null;
        }
        TeacherProfile tp = teacherProfileMapper.selectById(tc.getTeacherId());
        if (tp == null) {
            return null;
        }
        User u = userMapper.selectById(tp.getUserId());
        return u == null ? null : u.getRealName();
    }

    // ==================== 5.1 首页总览 ====================

    /**
     * 首页数据。
     *
     * <p>「当前该显示哪一条」的挑选顺序（对应 formal-v2 的首页五态）：
     * <ol>
     *   <li>有 IN_PROGRESS / OVERDUE → 显示它（态 A / C）</li>
     *   <li>有 PENDING → 显示最新一条（态 B）</li>
     *   <li>有 WAITING_START（已通过未开始）→ 显示它</li>
     *   <li>都没有 → 显示最近一条已终结的（态 D / E 的「已完成/已驳回」区块）</li>
     * </ol>
     */
    public Map<String, Object> home() {
        StudentProfile sp = currentStudent();
        LocalDateTime now = LocalDateTime.now();

        List<LeaveApplication> all = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, sp.getId())
                        .orderByDesc(LeaveApplication::getCreatedAt));

        LeaveApplication hero = pickHero(all, now);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("now", now.format(DT));

        // 学生信息（首页头部：问候语 + 班级）
        ClassInfo cls = classOf(sp);
        User u = userMapper.selectById(sp.getUserId());
        Map<String, Object> student = new LinkedHashMap<>();
        student.put("realName", u == null ? null : u.getRealName());
        student.put("studentNo", sp.getStudentNo());
        student.put("className", cls == null ? null : cls.getClassName());
        student.put("major", sp.getMajor());
        student.put("grade", sp.getGrade());
        student.put("counselorName", cls == null ? null : counselorName(cls.getId()));
        data.put("student", student);

        data.put("current", hero == null ? null : currentBlock(hero, now));
        data.put("recent", recentBlock(all, hero, now));
        data.put("stats", statsBlock(all, now));
        return data;
    }

    /** 挑选首页主卡片 */
    private LeaveApplication pickHero(List<LeaveApplication> all, LocalDateTime now) {
        Optional<LeaveApplication> active = all.stream()
                .filter(a -> EffectiveStatus.of(a, now).isActive())
                .findFirst();   // all 已按创建时间倒序
        if (active.isPresent()) {
            return active.get();
        }
        Optional<LeaveApplication> pending = all.stream()
                .filter(a -> "PENDING".equals(a.getStatus()))
                .findFirst();
        if (pending.isPresent()) {
            return pending.get();
        }
        Optional<LeaveApplication> waiting = all.stream()
                .filter(a -> EffectiveStatus.of(a, now) == EffectiveStatus.WAITING_START)
                .findFirst();
        if (waiting.isPresent()) {
            return waiting.get();
        }
        // 没有进行中的：给最近一条已终结的（首页会显示"本次请假已完成/申请未通过"）
        return all.isEmpty() ? null : all.get(0);
    }

    /** 首页主卡片数据块 */
    private Map<String, Object> currentBlock(LeaveApplication a, LocalDateTime now) {
        EffectiveStatus es = EffectiveStatus.of(a, now);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("applicationId", a.getId());
        m.put("applicationNo", a.getApplicationNo());
        m.put("leaveScene", a.getLeaveScene());
        m.put("leaveType", a.getLeaveType());
        m.put("startTime", a.getStartTime().format(DT));
        m.put("endTime", a.getEndTime().format(DT));
        m.put("status", a.getStatus());
        m.put("effectiveStatus", es.name());
        m.put("overdue", es == EffectiveStatus.OVERDUE);
        m.put("reason", a.getReason());
        m.put("destination", a.getDestination());
        m.put("contactPhone", a.getContactPhone());

        // 审批信息（首页 facts 行「审批 张老师 10-16 17:30」）
        m.put("approvedAt", a.getApprovedAt() == null ? null : a.getApprovedAt().format(DT));
        m.put("approvedBy", a.getApprovedByUserId() == null ? null
                : approvedByName(a.getApprovedByUserId()));

        // 驳回原因（态「申请未通过」下方灰底提示）
        m.put("rejectReason", "REJECTED".equals(a.getStatus()) ? latestLogComment(a.getId(), "REJECT") : null);

        // 是否有待审续假（前端按钮文案「续假审批中」）
        Long pendingExt = extensionMapper.selectCount(
                Wrappers.<LeaveExtension>lambdaQuery()
                        .eq(LeaveExtension::getApplicationId, a.getId())
                        .eq(LeaveExtension::getStatus, "PENDING"));
        m.put("hasPendingExtension", pendingExt != null && pendingExt > 0);

        // 进度步数信息（四步流程：提交 → 审批 → 生效 → 销假）
        m.put("submittedAt", a.getCreatedAt().format(DT));
        m.put("completedAt", a.getActualEndTime() == null ? null : a.getActualEndTime().format(DT));

        // 进度条/剩余时间用的毫秒数（前端直接算百分比，避免时区/格式问题）
        m.put("totalMillis", Duration.between(a.getStartTime(), a.getEndTime()).toMillis());
        m.put("elapsedMillis", Math.max(0, Duration.between(a.getStartTime(), now).toMillis()));
        m.put("remainingMillis", Math.max(0, Duration.between(now, a.getEndTime()).toMillis()));
        m.put("overdueMillis", es == EffectiveStatus.OVERDUE
                ? Duration.between(a.getEndTime(), now).toMillis() : 0L);
        m.put("waitingMillis", Math.max(0, Duration.between(a.getCreatedAt(), now).toMillis()));
        m.put("beforeStartMillis", Math.max(0, Duration.between(now, a.getStartTime()).toMillis()));

        return m;
    }

    /** 审批人姓名（user.real_name） */
    private String approvedByName(Long userId) {
        User u = userMapper.selectById(userId);
        return u == null ? null : u.getRealName();
    }

    /**
     * 取某条申请最新一条指定动作的日志意见。
     * 主表没有 approval_comment 字段，审批意见存在日志表里（03 §5.4 R-01）。
     */
    private String latestLogComment(Long applicationId, String action) {
        LeaveApprovalLog log = approvalLogMapper.selectOne(
                Wrappers.<LeaveApprovalLog>lambdaQuery()
                        .eq(LeaveApprovalLog::getApplicationId, applicationId)
                        .eq(LeaveApprovalLog::getAction, action)
                        .orderByDesc(LeaveApprovalLog::getCreatedAt)
                        .last("LIMIT 1"));
        return log == null ? null : log.getComment();
    }

    /** 最近记录（首页「最近记录」区块，最多 3 条；已终结的优先） */
    private List<Map<String, Object>> recentBlock(List<LeaveApplication> all, LeaveApplication hero, LocalDateTime now) {
        return all.stream()
                .filter(a -> hero == null || !Objects.equals(a.getId(), hero.getId()))
                .limit(3)
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("applicationId", a.getId());
                    m.put("applicationNo", a.getApplicationNo());
                    m.put("summary", summary(a));
                    m.put("status", a.getStatus());
                    m.put("effectiveStatus", EffectiveStatus.of(a, now).name());
                    m.put("startTime", a.getStartTime().format(DT));
                    return m;
                })
                .collect(Collectors.toList());
    }

    /** 列表展示用摘要：「校内 · 事假」 */
    private String summary(LeaveApplication a) {
        return sceneLabel(a.getLeaveScene()) + " · " + typeLabel(a.getLeaveType());
    }

    public static String sceneLabel(String scene) {
        return "OFF_CAMPUS".equals(scene) ? "离校" : "校内";
    }

    public static String typeLabel(String type) {
        if ("SICK".equals(type)) return "病假";
        if ("PERSONAL".equals(type)) return "事假";
        return "其他";
    }

    // ==================== 5.13 个人统计 ====================

    /**
     * 个人统计（4 指标，对应 03 §5.13）：
     * 申请总数 / 已通过数 / 已完成数 / 当前逾期数。
     */
    public Map<String, Object> stats() {
        StudentProfile sp = currentStudent();
        List<LeaveApplication> all = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, sp.getId()));
        return statsBlock(all, LocalDateTime.now());
    }

    private Map<String, Object> statsBlock(List<LeaveApplication> all, LocalDateTime now) {
        int total = all.size();
        int approved = (int) all.stream()
                .filter(a -> "APPROVED".equals(a.getStatus()) || "COMPLETED".equals(a.getStatus()))
                .count();
        int completed = (int) all.stream()
                .filter(a -> "COMPLETED".equals(a.getStatus()))
                .count();
        int overdue = (int) all.stream()
                .filter(a -> EffectiveStatus.of(a, now) == EffectiveStatus.OVERDUE)
                .count();

        // 本学期概览（首页 D 态：离校 X 次 / 校内 Y 次 / 平均 Z 天）
        long offCount = all.stream().filter(a -> "OFF_CAMPUS".equals(a.getLeaveScene())).count();
        long onCount = total - offCount;
        double avgDays = all.isEmpty() ? 0
                : all.stream()
                    .mapToLong(a -> Duration.between(a.getStartTime(), a.getEndTime()).toMinutes())
                    .average().orElse(0) / 1440.0;

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalApplications", total);
        m.put("approved", approved);
        m.put("completed", completed);
        m.put("currentOverdue", overdue);
        m.put("offCampusCount", offCount);
        m.put("onCampusCount", onCount);
        m.put("averageDays", Math.round(avgDays * 10) / 10.0);   // 保留 1 位小数
        return m;
    }

    // ==================== 5.3 申请列表 ====================

    /**
     * 我的申请列表。
     *
     * @param filter 六档筛选（对应记录页 tab）：
     *               all 全部 / pending 待审批 / approved 已通过 / active 请假中
     *               / closed 已结束 / overdue 逾期
     */
    public List<Map<String, Object>> list(String filter) {
        StudentProfile sp = currentStudent();
        LocalDateTime now = LocalDateTime.now();

        List<LeaveApplication> all = applicationMapper.selectList(
                Wrappers.<LeaveApplication>lambdaQuery()
                        .eq(LeaveApplication::getStudentId, sp.getId())
                        .orderByDesc(LeaveApplication::getStartTime));

        String f = filter == null ? "all" : filter;
        return all.stream()
                .filter(a -> matchFilter(a, now, f))
                .map(a -> {
                    EffectiveStatus es = EffectiveStatus.of(a, now);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("applicationId", a.getId());
                    m.put("applicationNo", a.getApplicationNo());
                    m.put("leaveScene", a.getLeaveScene());
                    m.put("leaveType", a.getLeaveType());
                    m.put("summary", summary(a));
                    m.put("startTime", a.getStartTime().format(DT));
                    m.put("endTime", a.getEndTime().format(DT));
                    m.put("status", a.getStatus());
                    m.put("effectiveStatus", es.name());
                    m.put("statusLabel", statusLabel(es));
                    // 副标题：列表第二行的说明文字（"还剩 3 小时 · 返校后定位销假"）
                    m.put("subText", subText(a, es, now));
                    return m;
                })
                .collect(Collectors.toList());
    }

    private boolean matchFilter(LeaveApplication a, LocalDateTime now, String filter) {
        EffectiveStatus es = EffectiveStatus.of(a, now);
        switch (filter) {
            case "pending":
                return es == EffectiveStatus.PENDING;
            case "approved":
                // 已通过 = 已批准但还没到开始时间（请假中的归"进行中"）
                return es == EffectiveStatus.WAITING_START;
            case "active":
                // 进行中 = 请假中 + 逾期（逾期本质也是没结束）
                return es == EffectiveStatus.IN_PROGRESS || es == EffectiveStatus.OVERDUE;
            case "completed":
                return es == EffectiveStatus.COMPLETED;
            case "rejected":
                return es == EffectiveStatus.REJECTED;
            case "closed":
                return es.isClosed();
            case "overdue":
                return es == EffectiveStatus.OVERDUE;
            case "all":
            default:
                return true;
        }
    }

    /**
     * 列表副标题。对应 formal-v2 记录页卡片第二行，
     * 用一句话说明「现在到哪一步了」，比只给状态标签更有信息量。
     */
    private String subText(LeaveApplication a, EffectiveStatus es, LocalDateTime now) {
        switch (es) {
            case IN_PROGRESS:
                return "还剩 " + durationText(Duration.between(now, a.getEndTime()))
                        + ("OFF_CAMPUS".equals(a.getLeaveScene()) ? " · 返校后定位销假" : " · 结束后自主确认");
            case OVERDUE:
                return "已超过结束时间 " + durationText(Duration.between(a.getEndTime(), now));
            case PENDING:
                return "已提交 " + durationText(Duration.between(a.getCreatedAt(), now)) + "，等待审批";
            case WAITING_START:
                return a.getStartTime().format(DT) + " 开始";
            case COMPLETED:
                return a.getActualEndTime() == null ? "已销假"
                        : a.getActualEndTime().format(DT) + " 完成销假";
            case REJECTED: {
                String r = latestLogComment(a.getId(), "REJECT");
                return r == null || r.isEmpty() ? "申请未通过" : r;
            }
            case WITHDRAWN:
                return "本人已撤回";
            case CANCELLED:
                return "本人已取消";
            default:
                return "";
        }
    }

    /** 时长文字："3 小时 20 分" / "2 天 4 小时"。与前端 partsText 保持一致的口径 */
    private String durationText(Duration d) {
        long totalMin = Math.max(0, d.toMinutes());
        long days = totalMin / 1440;
        long hours = (totalMin % 1440) / 60;
        long mins = totalMin % 60;
        if (days > 0) return hours > 0 ? days + " 天 " + hours + " 小时" : days + " 天";
        if (hours > 0) return mins > 0 ? hours + " 小时 " + mins + " 分" : hours + " 小时";
        return mins + " 分钟";
    }

    /** 展示态中文名（记录页右侧状态、首页状态词都用它） */
    public static String statusLabel(EffectiveStatus es) {
        switch (es) {
            case PENDING:       return "待审批";
            case WAITING_START: return "已通过";
            case IN_PROGRESS:   return "请假中";
            case OVERDUE:       return "逾期";
            case COMPLETED:     return "已销假";
            case REJECTED:      return "已驳回";
            case WITHDRAWN:     return "已撤回";
            case CANCELLED:     return "已取消";
            default:            return "未知";
        }
    }

    // ==================== 5.4 申请详情 ====================

    /**
     * 申请详情：基础信息 + 材料 + 销假记录 + 审批时间轴 + 续假 + 可用动作。
     */
    public Map<String, Object> detail(Long applicationId) {
        StudentProfile sp = currentStudent();
        LeaveApplication a = applicationMapper.selectById(applicationId);

        // 越权防护：只能看自己的申请（学生 A 拿到学生 B 的 id 也必须被拒）
        if (a == null || !Objects.equals(a.getStudentId(), sp.getId())) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        LocalDateTime now = LocalDateTime.now();
        EffectiveStatus es = EffectiveStatus.of(a, now);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("now", now.format(DT));
        m.put("applicationId", a.getId());
        m.put("applicationNo", a.getApplicationNo());
        m.put("leaveScene", a.getLeaveScene());
        m.put("leaveSceneLabel", sceneLabel(a.getLeaveScene()));
        m.put("leaveType", a.getLeaveType());
        m.put("leaveTypeLabel", typeLabel(a.getLeaveType()));
        m.put("startTime", a.getStartTime().format(DT));
        m.put("endTime", a.getEndTime().format(DT));
        m.put("reason", a.getReason());
        m.put("destination", a.getDestination());
        m.put("contactPhone", a.getContactPhone());
        m.put("status", a.getStatus());
        m.put("effectiveStatus", es.name());
        m.put("statusLabel", statusLabel(es));
        m.put("actualEndTime", a.getActualEndTime() == null ? null : a.getActualEndTime().format(DT));
        m.put("cancelReason", a.getCancelReason());
        m.put("approvedAt", a.getApprovedAt() == null ? null : a.getApprovedAt().format(DT));
        m.put("approvedBy", a.getApprovedByUserId() == null ? null : approvedByName(a.getApprovedByUserId()));
        m.put("approvalComment", latestLogComment(a.getId(), "APPROVE") != null
                ? latestLogComment(a.getId(), "APPROVE") : latestLogComment(a.getId(), "REJECT"));
        m.put("createdAt", a.getCreatedAt().format(DT));

        // 材料
        List<LeaveMaterial> materials = materialMapper.selectList(
                Wrappers.<LeaveMaterial>lambdaQuery().eq(LeaveMaterial::getApplicationId, a.getId()));
        m.put("materials", materials.stream().map(x -> {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("id", x.getId());
            mm.put("materialType", x.getMaterialType());
            mm.put("fileName", x.getFileName());
            mm.put("fileUrl", x.getFileUrl());
            mm.put("fileSize", x.getFileSize());
            return mm;
        }).collect(Collectors.toList()));

        // 销假 / 核验记录（按时间正序，详情页时间轴用）
        List<LeaveCheckinLog> logs = checkinLogMapper.selectList(
                Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getApplicationId, a.getId())
                        .orderByAsc(LeaveCheckinLog::getCheckTime));
        m.put("checkinLogs", logs.stream().map(x -> {
            Map<String, Object> cm = new LinkedHashMap<>();
            cm.put("id", x.getId());
            cm.put("checkType", x.getCheckType());
            cm.put("checkResult", x.getCheckResult());
            cm.put("reviewStatus", x.getReviewStatus());
            cm.put("distanceM", x.getDistanceM());
            cm.put("checkTime", x.getCheckTime().format(DT));
            cm.put("reviewComment", x.getReviewComment());
            return cm;
        }).collect(Collectors.toList()));

        // 续假（最新一条）
        LeaveExtension ext = extensionMapper.selectOne(
                Wrappers.<LeaveExtension>lambdaQuery()
                        .eq(LeaveExtension::getApplicationId, a.getId())
                        .orderByDesc(LeaveExtension::getCreatedAt)
                        .last("LIMIT 1"));
        if (ext != null) {
            Map<String, Object> em = new LinkedHashMap<>();
            em.put("id", ext.getId());
            em.put("status", ext.getStatus());
            em.put("requestedEndTime", ext.getRequestedEndTime().format(DT));
            em.put("reason", ext.getReason());
            m.put("extension", em);
        } else {
            m.put("extension", null);
        }

        // 可用动作（前端据此显示按钮；后端各接口仍会二次校验）
        m.put("actions", actions(es, a));

        return m;
    }

    /**
     * 计算当前状态下学生能做什么（03 §5.4）。
     * 前端只负责显示，真正的状态守卫在后端每个接口里。
     */
    private List<String> actions(EffectiveStatus es, LeaveApplication a) {
        List<String> acts = new ArrayList<>();
        switch (es) {
            case PENDING:
                acts.add("WITHDRAW");      // 待审批可撤回
                break;
            case WAITING_START:
                acts.add("CANCEL");        // 已通过未开始可取消
                break;
            case IN_PROGRESS:
                acts.add("CHECKIN");       // 请假中可销假
                acts.add("EXTENSION");     // 也可申请续假
                break;
            case OVERDUE:
                acts.add("CHECKIN");       // 逾期可补销假
                acts.add("MANUAL_REVIEW"); // 定位失败可申请人工核验
                break;
            default:
                break;
        }
        return acts;
    }

    // ==================== 5.12 消息 ====================

    /** 消息列表（未读在前，按时间倒序） */
    public List<Map<String, Object>> messages(Boolean onlyUnread) {
        Long userId = CurrentUser.requireUserId();
        List<Notification> list = notificationMapper.selectList(
                Wrappers.<Notification>lambdaQuery()
                        .eq(Notification::getReceiverId, userId)
                        .eq(onlyUnread != null && onlyUnread, Notification::getIsRead, 0)
                        .orderByAsc(Notification::getIsRead)      // 未读在前
                        .orderByDesc(Notification::getCreatedAt)
                        .orderByDesc(Notification::getId));        // id 兜底：同秒插入时保证稳定顺序

        return list.stream().map(n -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.getId());
            m.put("type", n.getType());
            m.put("title", n.getTitle());
            m.put("content", n.getContent());
            m.put("businessType", n.getBusinessType());
            m.put("businessId", n.getBusinessId());
            m.put("isRead", n.getIsRead() != null && n.getIsRead() == 1);
            m.put("createdAt", n.getCreatedAt().format(DT));
            return m;
        }).collect(Collectors.toList());
    }

    /** 未读数（tab 角标） */
    public long unreadCount() {
        Long userId = CurrentUser.requireUserId();
        Long c = notificationMapper.selectCount(
                Wrappers.<Notification>lambdaQuery()
                        .eq(Notification::getReceiverId, userId)
                        .eq(Notification::getIsRead, 0));
        return c == null ? 0 : c;
    }

    /** 标记单条已读（校验归属，防止改别人的消息） */
    public void markRead(Long id) {
        Long userId = CurrentUser.requireUserId();
        Notification n = notificationMapper.selectById(id);
        if (n == null || !Objects.equals(n.getReceiverId(), userId)) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        n.setIsRead(1);
        notificationMapper.updateById(n);
    }

    /** 全部已读 */
    public void markAllRead() {
        Long userId = CurrentUser.requireUserId();
        Notification update = new Notification();
        update.setIsRead(1);
        notificationMapper.update(update,
                Wrappers.<Notification>lambdaUpdate()
                        .eq(Notification::getReceiverId, userId)
                        .eq(Notification::getIsRead, 0));
    }
}
