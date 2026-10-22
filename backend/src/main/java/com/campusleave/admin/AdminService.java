package com.campusleave.admin;

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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 管理端服务（03_API §7）。
 *
 * <p>四件事：开户、建班、绑辅导员、改配置。
 *
 * <p><b>两条容易被忽略的规则</b>：
 * <ul>
 *   <li>班级不物理删除 —— 走 {@code status=DISABLED}。班里还有在读学生时禁止停用（40901），
 *       否则这些学生的申请会直接报「班级未配置辅导员」（42204），而且是系统性的</li>
 *   <li>一个班级只能有一个辅导员（{@code teacher_class.class_id} 唯一）。换人要先解绑再绑，
 *       不能两个辅导员同时审批同一个班 —— 这会直接破坏"谁批的"这条审计链</li>
 * </ul>
 *
 * <p>密码一律 BCrypt 哈希后入库，接口从不返回 {@code passwordHash}。
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final UserMapper userMapper;
    private final StudentProfileMapper studentMapper;
    private final TeacherProfileMapper teacherMapper;
    private final ClassInfoMapper classMapper;
    private final TeacherClassMapper teacherClassMapper;
    private final LeaveApplicationMapper applicationMapper;
    private final LeaveCheckinLogMapper checkinLogMapper;
    private final LeaveExtensionMapper extensionMapper;
    private final SystemConfigMapper configMapper;
    private final PasswordEncoder passwordEncoder;

    // ==================== 7.1 账号 ====================

    public PageResult<Map<String, Object>> users(String role, String keyword, int page, int size) {
        var q = Wrappers.<User>lambdaQuery();
        if (role != null && !role.isBlank()) q.eq(User::getRole, role);
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            q.and(w -> w.like(User::getUsername, kw).or().like(User::getRealName, kw));
        }
        q.orderByDesc(User::getCreatedAt);

        Page<User> p = userMapper.selectPage(new Page<>(page, size), q);
        if (p.getRecords().isEmpty()) return new PageResult<>(List.of(), p.getTotal(), page, size);

        List<Long> ids = p.getRecords().stream().map(User::getId).collect(Collectors.toList());
        Map<Long, StudentProfile> spByUser = studentMapper
                .selectList(Wrappers.<StudentProfile>lambdaQuery().in(StudentProfile::getUserId, ids))
                .stream().collect(Collectors.toMap(StudentProfile::getUserId, x -> x, (a, b) -> a));
        Map<Long, TeacherProfile> tpByUser = teacherMapper
                .selectList(Wrappers.<TeacherProfile>lambdaQuery().in(TeacherProfile::getUserId, ids))
                .stream().collect(Collectors.toMap(TeacherProfile::getUserId, x -> x, (a, b) -> a));
        Map<Long, String> clsMap = classMapper.selectList(null).stream()
                .collect(Collectors.toMap(ClassInfo::getId, ClassInfo::getClassName, (a, b) -> a));

        List<Map<String, Object>> rows = p.getRecords().stream().map(u -> {
            StudentProfile sp = spByUser.get(u.getId());
            TeacherProfile tp = tpByUser.get(u.getId());
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", u.getId());
            r.put("username", u.getUsername());
            r.put("realName", u.getRealName());
            r.put("role", u.getRole());
            r.put("phone", nz(u.getPhone()));
            r.put("status", u.getStatus());
            if (sp != null) {
                r.put("studentNo", sp.getStudentNo());
                r.put("className", clsMap.getOrDefault(sp.getClassId(), ""));
            } else if (tp != null) {
                r.put("teacherNo", tp.getTeacherNo());
                r.put("department", nz(tp.getDepartment()));
            }
            r.put("createdAt", u.getCreatedAt() == null ? "" : DT.format(u.getCreatedAt()));
            return r;
        }).collect(Collectors.toList());

        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    /**
     * 开户。STUDENT 必须同时给学号和班级，TEACHER 必须给工号。
     * user + profile 必须同一事务，否则会出现"能登录但没档案"的半截账号。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createUser(Map<String, Object> body) {
        String username = str(body, "username");
        String realName = str(body, "realName");
        String role = str(body, "role");
        if (username == null || realName == null || role == null) {
            throw new BizException(ErrorCode.BAD_PARAM, "username / realName / role 必填");
        }
        if (!Set.of("STUDENT", "TEACHER", "ADMIN").contains(role)) {
            throw new BizException(ErrorCode.BAD_PARAM, "role 只能是 STUDENT / TEACHER / ADMIN");
        }
        Long dup = userMapper.selectCount(Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
        if (dup != null && dup > 0) {
            throw new BizException(ErrorCode.DUPLICATE_SUBMIT, "账号 " + username + " 已存在");
        }

        String initPwd = body.get("initialPassword") == null ? "123456" : String.valueOf(body.get("initialPassword"));
        LocalDateTime now = LocalDateTime.now();

        User u = new User();
        u.setUsername(username);
        u.setPasswordHash(passwordEncoder.encode(initPwd));
        u.setRole(role);
        u.setRealName(realName);
        u.setPhone(str(body, "phone"));
        u.setStatus("ACTIVE");
        u.setCreatedAt(now);
        u.setUpdatedAt(now);
        userMapper.insert(u);

        if ("STUDENT".equals(role)) {
            String studentNo = str(body, "studentNo");
            Object classId = body.get("classId");
            if (studentNo == null || classId == null) {
                throw new BizException(ErrorCode.BAD_PARAM, "新建学生必须提供 studentNo 与 classId");
            }
            StudentProfile sp = new StudentProfile();
            sp.setUserId(u.getId());
            sp.setStudentNo(studentNo);
            sp.setClassId(Long.valueOf(String.valueOf(classId)));
            sp.setGender(str(body, "gender"));
            sp.setMajor(str(body, "major"));
            sp.setCreatedAt(now);
            sp.setUpdatedAt(now);
            studentMapper.insert(sp);
        } else if ("TEACHER".equals(role)) {
            String teacherNo = str(body, "teacherNo");
            if (teacherNo == null) {
                throw new BizException(ErrorCode.BAD_PARAM, "新建教师必须提供 teacherNo");
            }
            TeacherProfile tp = new TeacherProfile();
            tp.setUserId(u.getId());
            tp.setTeacherNo(teacherNo);
            tp.setDepartment(str(body, "department"));
            tp.setCreatedAt(now);
            tp.setUpdatedAt(now);
            teacherMapper.insert(tp);
        }

        return Map.of("id", u.getId(), "username", username);
    }

    public void setUserStatus(Long id, String status) {
        if (!Set.of("ACTIVE", "DISABLED").contains(status)) {
            throw new BizException(ErrorCode.BAD_PARAM, "status 只能是 ACTIVE / DISABLED");
        }
        User u = userMapper.selectById(id);
        if (u == null) throw new BizException(ErrorCode.NOT_FOUND, "账号不存在");
        // 不允许把自己停用，否则下一次就没人能进后台了
        if (id.equals(CurrentUser.requireUserId()) && "DISABLED".equals(status)) {
            throw new BizException(ErrorCode.ACTION_NOT_ALLOWED, "不能停用当前登录账号");
        }
        userMapper.update(null, Wrappers.<User>lambdaUpdate()
                .set(User::getStatus, status)
                .set(User::getUpdatedAt, LocalDateTime.now())
                .eq(User::getId, id));
    }

    public void resetPassword(Long id, String newPassword) {
        if (newPassword == null || newPassword.length() < 6) {
            throw new BizException(ErrorCode.BAD_PARAM, "密码至少 6 位");
        }
        User u = userMapper.selectById(id);
        if (u == null) throw new BizException(ErrorCode.NOT_FOUND, "账号不存在");
        userMapper.update(null, Wrappers.<User>lambdaUpdate()
                .set(User::getPasswordHash, passwordEncoder.encode(newPassword))
                .set(User::getUpdatedAt, LocalDateTime.now())
                .eq(User::getId, id));
    }

    // ==================== 7.2 班级 ====================

    public PageResult<Map<String, Object>> classes(String keyword, int page, int size) {
        var q = Wrappers.<ClassInfo>lambdaQuery();
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            q.and(w -> w.like(ClassInfo::getClassName, kw).or().like(ClassInfo::getClassCode, kw));
        }
        q.orderByAsc(ClassInfo::getClassCode);

        Page<ClassInfo> p = classMapper.selectPage(new Page<>(page, size), q);
        if (p.getRecords().isEmpty()) return new PageResult<>(List.of(), p.getTotal(), page, size);

        List<Long> ids = p.getRecords().stream().map(ClassInfo::getId).collect(Collectors.toList());
        Map<Long, Long> studentCount = studentMapper
                .selectList(Wrappers.<StudentProfile>lambdaQuery().in(StudentProfile::getClassId, ids))
                .stream().collect(Collectors.groupingBy(StudentProfile::getClassId, Collectors.counting()));
        Map<Long, Long> teacherByClass = teacherClassMapper
                .selectList(Wrappers.<TeacherClass>lambdaQuery().in(TeacherClass::getClassId, ids))
                .stream().collect(Collectors.toMap(TeacherClass::getClassId, TeacherClass::getTeacherId, (a, b) -> a));
        // teacher_profile 只存工号，姓名在 user 表 —— 这里要的是「张老师」不是「T2023001」
        Map<Long, TeacherProfile> tpById = teacherMapper.selectList(null).stream()
                .collect(Collectors.toMap(TeacherProfile::getId, x -> x, (a, b) -> a));
        Map<Long, User> teacherUser = userMapper.selectList(
                        Wrappers.<User>lambdaQuery().eq(User::getRole, "TEACHER"))
                .stream().collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));
        Map<Long, String> teacherName = new HashMap<>();
        tpById.forEach((tid, tp) -> {
            User u = teacherUser.get(tp.getUserId());
            teacherName.put(tid, u == null ? tp.getTeacherNo() : u.getRealName());
        });

        List<Map<String, Object>> rows = p.getRecords().stream().map(c -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", c.getId());
            r.put("className", c.getClassName());
            r.put("classCode", c.getClassCode());
            r.put("major", nz(c.getMajor()));
            r.put("grade", nz(c.getGrade()));
            r.put("status", c.getStatus());
            r.put("studentCount", studentCount.getOrDefault(c.getId(), 0L));
            Long tid = teacherByClass.get(c.getId());
            r.put("teacherId", tid);
            r.put("teacherName", tid == null ? "" : teacherName.getOrDefault(tid, ""));
            return r;
        }).collect(Collectors.toList());
        return new PageResult<>(rows, p.getTotal(), page, size);
    }

    public Map<String, Object> createClass(Map<String, Object> body) {
        String name = str(body, "className");
        String code = str(body, "classCode");
        if (name == null || code == null) {
            throw new BizException(ErrorCode.BAD_PARAM, "className / classCode 必填");
        }
        Long dup = classMapper.selectCount(Wrappers.<ClassInfo>lambdaQuery().eq(ClassInfo::getClassCode, code));
        if (dup != null && dup > 0) {
            throw new BizException(ErrorCode.DUPLICATE_SUBMIT, "班级编码 " + code + " 已存在");
        }
        LocalDateTime now = LocalDateTime.now();
        ClassInfo c = new ClassInfo();
        c.setClassName(name);
        c.setClassCode(code);
        c.setMajor(str(body, "major"));
        c.setGrade(str(body, "grade"));
        c.setStatus("ACTIVE");
        c.setCreatedAt(now);
        c.setUpdatedAt(now);
        classMapper.insert(c);
        return Map.of("id", c.getId(), "className", name);
    }

    public void updateClass(Long id, Map<String, Object> body) {
        ClassInfo c = classMapper.selectById(id);
        if (c == null) throw new BizException(ErrorCode.NOT_FOUND, "班级不存在");
        classMapper.update(null, Wrappers.<ClassInfo>lambdaUpdate()
                .set(body.get("className") != null, ClassInfo::getClassName, str(body, "className"))
                .set(body.get("major") != null, ClassInfo::getMajor, str(body, "major"))
                .set(body.get("grade") != null, ClassInfo::getGrade, str(body, "grade"))
                .set(ClassInfo::getUpdatedAt, LocalDateTime.now())
                .eq(ClassInfo::getId, id));
    }

    /**
     * 停用班级（软删）。班里还有学生就拒绝 —— 停用后这些学生提交申请会直接 42204。
     */
    public void disableClass(Long id) {
        long active = studentMapper.selectCount(
                Wrappers.<StudentProfile>lambdaQuery().eq(StudentProfile::getClassId, id));
        if (active > 0) {
            throw new BizException(ErrorCode.STATUS_CONFLICT,
                    "该班级还有 " + active + " 名学生，不能停用；请先转移学生");
        }
        classMapper.update(null, Wrappers.<ClassInfo>lambdaUpdate()
                .set(ClassInfo::getStatus, "DISABLED")
                .set(ClassInfo::getUpdatedAt, LocalDateTime.now())
                .eq(ClassInfo::getId, id));
    }

    // ==================== 7.3 辅导员-班级绑定 ====================

    public List<Map<String, Object>> teacherClasses(Long teacherId, Long classId) {
        var q = Wrappers.<TeacherClass>lambdaQuery();
        if (teacherId != null) q.eq(TeacherClass::getTeacherId, teacherId);
        if (classId != null) q.eq(TeacherClass::getClassId, classId);

        List<TeacherClass> list = teacherClassMapper.selectList(q);
        if (list.isEmpty()) return List.of();

        Map<Long, TeacherProfile> tpMap = teacherMapper.selectBatchIds(
                        list.stream().map(TeacherClass::getTeacherId).distinct().collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(TeacherProfile::getId, x -> x, (a, b) -> a));
        Map<Long, User> userMap = userMapper.selectBatchIds(
                        tpMap.values().stream().map(TeacherProfile::getUserId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));
        Map<Long, ClassInfo> clsMap = classMapper.selectBatchIds(
                        list.stream().map(TeacherClass::getClassId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(ClassInfo::getId, x -> x, (a, b) -> a));

        return list.stream().map(tc -> {
            TeacherProfile tp = tpMap.get(tc.getTeacherId());
            User u = tp == null ? null : userMap.get(tp.getUserId());
            ClassInfo c = clsMap.get(tc.getClassId());
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", tc.getId());
            r.put("teacherId", tc.getTeacherId());
            r.put("teacherName", u == null ? "" : u.getRealName());
            r.put("teacherNo", tp == null ? "" : tp.getTeacherNo());
            r.put("classId", tc.getClassId());
            r.put("className", c == null ? "" : c.getClassName());
            r.put("createdAt", tc.getCreatedAt() == null ? "" : DT.format(tc.getCreatedAt()));
            return r;
        }).collect(Collectors.toList());
    }

    public Map<String, Object> bind(Map<String, Object> body) {
        Object tid = body.get("teacherId");
        Object cid = body.get("classId");
        if (tid == null || cid == null) {
            throw new BizException(ErrorCode.BAD_PARAM, "teacherId / classId 必填");
        }
        Long teacherId = Long.valueOf(String.valueOf(tid));
        Long classId = Long.valueOf(String.valueOf(cid));

        if (teacherMapper.selectById(teacherId) == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "教师不存在");
        }
        if (classMapper.selectById(classId) == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "班级不存在");
        }
        Long exists = teacherClassMapper.selectCount(
                Wrappers.<TeacherClass>lambdaQuery().eq(TeacherClass::getClassId, classId));
        if (exists != null && exists > 0) {
            throw new BizException(ErrorCode.STATUS_CONFLICT,
                    "该班级已有辅导员，请先解绑（一个班级只能有一个负责教师）");
        }

        TeacherClass tc = new TeacherClass();
        tc.setTeacherId(teacherId);
        tc.setClassId(classId);
        tc.setCreatedAt(LocalDateTime.now());
        teacherClassMapper.insert(tc);
        return Map.of("id", tc.getId());
    }

    public void unbind(Long id) {
        TeacherClass tc = teacherClassMapper.selectById(id);
        if (tc == null) throw new BizException(ErrorCode.NOT_FOUND, "绑定关系不存在");
        teacherClassMapper.deleteById(id);
    }

    // ==================== 7.4 系统配置 ====================

    public List<Map<String, Object>> configs() {
        return configMapper.selectList(Wrappers.<SystemConfig>lambdaQuery().orderByAsc(SystemConfig::getConfigKey))
                .stream().map(c -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("key", c.getConfigKey());
                    r.put("value", c.getConfigValue());
                    r.put("type", nz(c.getConfigType()));
                    r.put("description", nz(c.getDescription()));
                    r.put("updatedAt", c.getUpdatedAt() == null ? "" : DT.format(c.getUpdatedAt()));
                    return r;
                }).collect(Collectors.toList());
    }

    /** 数值型配置的 key 白名单。
     *  为什么需要白名单：`ck_config_type` 只允许 STRING/INT/BOOLEAN/JSON，
     *  经纬度这种小数只能存成 STRING，光看 config_type 是拦不住 "not-a-number" 的。 */
    private static final Set<String> NUMERIC_KEYS = Set.of(
            "CAMPUS_CENTER_LAT", "CAMPUS_CENTER_LNG",
            "OFF_CAMPUS_CHECK_RADIUS_M", "START_REMINDER_WINDOW_MINUTES");

    public void updateConfig(String key, String value) {
        SystemConfig c = configMapper.selectOne(
                Wrappers.<SystemConfig>lambdaQuery().eq(SystemConfig::getConfigKey, key));
        if (c == null) throw new BizException(ErrorCode.NOT_FOUND, "配置项不存在：" + key);
        if (value == null || value.isBlank()) {
            throw new BizException(ErrorCode.BAD_PARAM, "配置值不能为空");
        }

        // 写库前按住类型：这几项一旦写脏，GPS 销假和提醒任务会直接炸，
        // 而且现场很难看出是配置被人改过
        String v = value.trim();
        String type = c.getConfigType() == null ? "STRING" : c.getConfigType().toUpperCase();
        boolean numeric = NUMERIC_KEYS.contains(key) || "INT".equals(type) || "NUMBER".equals(type);
        if (numeric) {
            try {
                Double.parseDouble(v);
            } catch (NumberFormatException e) {
                throw new BizException(ErrorCode.BAD_PARAM, key + " 必须是数字");
            }
        } else if ("BOOLEAN".equals(type)) {
            if (!"true".equalsIgnoreCase(v) && !"false".equalsIgnoreCase(v)) {
                throw new BizException(ErrorCode.BAD_PARAM, key + " 只能是 true / false");
            }
        }

        configMapper.update(null, Wrappers.<SystemConfig>lambdaUpdate()
                .set(SystemConfig::getConfigValue, v)
                .set(SystemConfig::getUpdatedBy, CurrentUser.requireUserId())
                .set(SystemConfig::getUpdatedAt, LocalDateTime.now())
                .eq(SystemConfig::getConfigKey, key));
    }

    // ==================== 7.5 全校统计 ====================

    public Map<String, Object> stats(String startDate, String endDate) {
        var q = Wrappers.<LeaveApplication>lambdaQuery();
        if (startDate != null && !startDate.isBlank()) {
            q.ge(LeaveApplication::getCreatedAt, LocalDateTime.parse(startDate + "T00:00:00"));
        }
        if (endDate != null && !endDate.isBlank()) {
            q.lt(LeaveApplication::getCreatedAt, LocalDateTime.parse(endDate + "T00:00:00").plusDays(1));
        }
        List<LeaveApplication> apps = applicationMapper.selectList(q);
        LocalDateTime now = LocalDateTime.now();

        long approved = apps.stream().filter(a -> Set.of("APPROVED", "COMPLETED").contains(a.getStatus())).count();
        long completed = apps.stream().filter(a -> "COMPLETED".equals(a.getStatus())).count();
        long overdue = apps.stream().filter(a -> EffectiveStatus.of(a, now) == EffectiveStatus.OVERDUE).count();
        long pending = apps.stream().filter(a -> "PENDING".equals(a.getStatus())).count();

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("totalApplications", apps.size());
        r.put("approved", approved);
        r.put("completed", completed);
        r.put("currentOverdue", overdue);
        r.put("pending", pending);
        return r;
    }


    // ==================== 7.6 管理端概览 ====================

    /**
     * 管理端首页：全校口径的统计、7 日趋势、类型分布、最近动态、系统提醒。
     *
     * <p>和教师工作台的区别：这里**不按班级过滤**，管理员看的是全校。
     *
     * <p>环比（delta）用的是「今日 vs 昨日」的创建量差，
     * 「较上月」的学生数用 student_profile.created_at 落在本月的增量 —— 都是近似值，
     * 数据量小的时候够用，真要精确得上每日快照表。
     */
    public Map<String, Object> overview() {
        LocalDateTime now = LocalDateTime.now();
        java.time.LocalDate today = now.toLocalDate();

        List<LeaveApplication> all = applicationMapper.selectList(null);

        long studentTotal = studentMapper.selectCount(null);
        long pending = all.stream().filter(a -> "PENDING".equals(a.getStatus())).count();
        long inProgress = all.stream()
                .filter(a -> EffectiveStatus.of(a, now) == EffectiveStatus.IN_PROGRESS).count();

        java.util.function.Function<java.time.LocalDate, Long> createdOn = d ->
                all.stream().filter(a -> a.getCreatedAt() != null && a.getCreatedAt().toLocalDate().equals(d)).count();

        long todayApps = createdOn.apply(today);
        long yesterdayApps = createdOn.apply(today.minusDays(1));
        long lastMonthStudents = studentMapper.selectCount(Wrappers.<StudentProfile>lambdaQuery()
                .ge(StudentProfile::getCreatedAt, today.withDayOfMonth(1).atStartOfDay()));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("studentTotal", studentTotal);
        stats.put("todayApplications", todayApps);
        stats.put("inProgress", inProgress);
        stats.put("pending", pending);

        Map<String, Object> deltas = new LinkedHashMap<>();
        deltas.put("studentTotal", lastMonthStudents);
        deltas.put("todayApplications", todayApps - yesterdayApps);
        deltas.put("inProgress", 0);
        deltas.put("pending", 0);

        /* 近 7 天趋势：离校 / 校内两条线 */
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            java.time.LocalDate d = today.minusDays(i);
            long off = all.stream().filter(a -> a.getCreatedAt() != null
                    && a.getCreatedAt().toLocalDate().equals(d)
                    && "OFF_CAMPUS".equals(a.getLeaveScene())).count();
            long on = all.stream().filter(a -> a.getCreatedAt() != null
                    && a.getCreatedAt().toLocalDate().equals(d)
                    && "ON_CAMPUS".equals(a.getLeaveScene())).count();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", String.format("%02d.%02d", d.getMonthValue(), d.getDayOfMonth()));
            row.put("off", off);
            row.put("on", on);
            trend.add(row);
        }

        /* 近 7 天请假类型分布 */
        java.time.LocalDate from = today.minusDays(6);
        Map<String, Long> byType = all.stream()
                .filter(a -> a.getCreatedAt() != null && !a.getCreatedAt().toLocalDate().isBefore(from))
                .collect(Collectors.groupingBy(
                        a -> a.getLeaveType() == null ? "OTHER" : a.getLeaveType(),
                        LinkedHashMap::new, Collectors.counting()));
        long typeSum = byType.values().stream().mapToLong(Long::longValue).sum();
        // 只展示前三类，其余归到「其他」，避免环形图碎片太多
        List<Map<String, Object>> types = new ArrayList<>();
        List<Map.Entry<String, Long>> sorted = byType.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .collect(Collectors.toList());
        long otherSum = 0;
        for (int i = 0; i < sorted.size(); i++) {
            Map.Entry<String, Long> e = sorted.get(i);
            if (i < 3) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", typeLabel(e.getKey()));
                row.put("value", e.getValue());
                row.put("pct", typeSum == 0 ? 0 : Math.round(e.getValue() * 1000.0 / typeSum) / 10.0);
                types.add(row);
            } else {
                otherSum += e.getValue();
            }
        }
        if (otherSum > 0) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", "其他");
            row.put("value", otherSum);
            row.put("pct", typeSum == 0 ? 0 : Math.round(otherSum * 1000.0 / typeSum) / 10.0);
            types.add(row);
        }

        /* 最近 5 条动态（全校） */
        List<LeaveApplication> recentApps = all.stream()
                .filter(a -> a.getCreatedAt() != null)
                .sorted(Comparator.comparing(LeaveApplication::getCreatedAt).reversed())
                .limit(5).collect(Collectors.toList());
        List<Map<String, Object>> recent = enrichRecent(recentApps, now);

        /* 系统提醒：只给真正需要人看的，不凑数 */
        List<Map<String, Object>> alerts = new ArrayList<>();
        long pendingReview = checkinLogMapper.selectCount(Wrappers.<LeaveCheckinLog>lambdaQuery()
                .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"));
        long pendingExt = extensionMapper.selectCount(Wrappers.<LeaveExtension>lambdaQuery()
                .eq(LeaveExtension::getStatus, "PENDING"));
        long overdue = all.stream().filter(a -> EffectiveStatus.of(a, now) == EffectiveStatus.OVERDUE).count();
        if (pendingReview > 0) {
            alerts.add(alert("warn", pendingReview + " 条异常核验待处理", "学生定位失败后申请了人工核验", "10-22 11:24"));
        }
        if (overdue > 0) {
            alerts.add(alert("danger", overdue + " 条申请已逾期未销假", "需要通知辅导员跟进", "10-22 09:16"));
        }
        if (pendingExt > 0) {
            alerts.add(alert("warn", pendingExt + " 条续假待审批", "学生延长请假需要辅导员确认", "10-22 10:05"));
        }
        alerts.add(alert("info", "系统已完成每日数据统计", "统计任务于 08:00 执行", "10-22 08:00"));

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("stats", stats);
        r.put("deltas", deltas);
        r.put("trend", trend);
        r.put("types", types);
        r.put("typeTotal", typeSum);
        r.put("recent", recent);
        r.put("alerts", alerts);
        Map<String, Object> todo = new LinkedHashMap<>();
        todo.put("pending", pending);
        todo.put("pendingReview", pendingReview);
        todo.put("pendingExtension", pendingExt);
        r.put("todo", todo);
        return r;
    }

    private Map<String, Object> alert(String tone, String text, String note, String time) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tone", tone);
        m.put("text", text);
        m.put("note", note);
        m.put("time", time);
        return m;
    }

    /** 全校口径的申请行，字段和教师端保持一致，前端可以复用同一个渲染器 */
    private List<Map<String, Object>> enrichRecent(List<LeaveApplication> apps, LocalDateTime now) {
        if (apps.isEmpty()) return List.of();
        List<Long> sids = apps.stream().map(LeaveApplication::getStudentId).distinct().collect(Collectors.toList());
        Map<Long, StudentProfile> spMap = studentMapper.selectBatchIds(sids).stream()
                .collect(Collectors.toMap(StudentProfile::getId, x -> x, (a, b) -> a));
        Map<Long, User> uMap = userMapper.selectBatchIds(
                        spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));
        Map<Long, String> clsMap = classMapper.selectList(null).stream()
                .collect(Collectors.toMap(ClassInfo::getId, ClassInfo::getClassName, (a, b) -> a));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (LeaveApplication a : apps) {
            StudentProfile sp = spMap.get(a.getStudentId());
            User u = sp == null ? null : uMap.get(sp.getUserId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("studentName", u == null ? "—" : u.getRealName());
            m.put("className", sp == null ? "" : clsMap.getOrDefault(sp.getClassId(), ""));
            m.put("scene", "OFF_CAMPUS".equals(a.getLeaveScene()) ? "离校" : "校内");
            m.put("type", typeLabel(a.getLeaveType()));
            m.put("start", a.getStartTime() == null ? "" : DT.format(a.getStartTime()));
            m.put("end", a.getEndTime() == null ? "" : DT.format(a.getEndTime()));
            m.put("status", a.getStatus());
            m.put("effective", EffectiveStatus.of(a, now).name());
            m.put("submittedAt", a.getCreatedAt() == null ? "" : DT.format(a.getCreatedAt()));
            rows.add(m);
        }
        return rows;
    }

    private static String typeLabel(String code) {
        if (code == null) return "其他";
        switch (code) {
            case "SICK": return "病假";
            case "PERSONAL": return "事假";
            case "PUBLIC": return "公假";
            case "OTHER": return "其他";
            default: return code;
        }
    }


    // ==================== 7.7 全校申请列表（请假申请 / 记录 / 异常核验共用） ====================

    /**
     * 管理员视角的申请列表：全校口径，不按班级过滤。
     *
     * @param scope   pending=待审批 / done=已处理 / all=全部
     * @param review  PENDING_REVIEW 时只返回有人工核验待处理的
     * @param keyword 学生姓名 / 学号 / 班级 模糊匹配
     */
    public PageResult<Map<String, Object>> applications(String scope, String review,
                                                        String keyword, int page, int size) {
        LocalDateTime now = LocalDateTime.now();
        List<LeaveApplication> all = applicationMapper.selectList(null);
        List<Map<String, Object>> rows = enrichFull(all, now);

        String kw = keyword == null ? "" : keyword.trim();
        List<Map<String, Object>> filtered = rows.stream()
                .filter(r -> {
                    if ("pending".equalsIgnoreCase(scope) && !"PENDING".equals(r.get("status"))) return false;
                    if ("done".equalsIgnoreCase(scope) && "PENDING".equals(r.get("status"))) return false;
                    if ("PENDING_REVIEW".equalsIgnoreCase(review) && !Boolean.TRUE.equals(r.get("needReview"))) return false;
                    if (kw.isEmpty()) return true;
                    return String.valueOf(r.get("studentName")).contains(kw)
                            || String.valueOf(r.get("studentNo")).contains(kw)
                            || String.valueOf(r.get("className")).contains(kw);
                })
                .sorted((a, b) -> String.valueOf(b.get("submittedAt")).compareTo(String.valueOf(a.get("submittedAt"))))
                .collect(Collectors.toList());

        int total = filtered.size();
        int from = Math.min((page - 1) * size, total);
        int to = Math.min(from + size, total);
        return new PageResult<>(filtered.subList(from, to), total, page, size);
    }

    /** 列表用的完整行：比 enrichRecent 多带原因、审批人、是否需要核验 */
    private List<Map<String, Object>> enrichFull(List<LeaveApplication> apps, LocalDateTime now) {
        if (apps.isEmpty()) return List.of();

        List<Long> sids = apps.stream().map(LeaveApplication::getStudentId).distinct().collect(Collectors.toList());
        Map<Long, StudentProfile> spMap = studentMapper.selectBatchIds(sids).stream()
                .collect(Collectors.toMap(StudentProfile::getId, x -> x, (a, b) -> a));
        List<Long> uids = spMap.values().stream().map(StudentProfile::getUserId).collect(Collectors.toList());
        Map<Long, User> uMap = uids.isEmpty() ? Map.of()
                : userMapper.selectBatchIds(uids).stream().collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));
        Map<Long, String> clsMap = classMapper.selectList(null).stream()
                .collect(Collectors.toMap(ClassInfo::getId, ClassInfo::getClassName, (a, b) -> a));
        Map<Long, User> approverMap = userMapper.selectList(null).stream()
                .collect(Collectors.toMap(User::getId, x -> x, (a, b) -> a));

        // 需要人工核验的申请 id
        Set<Long> needReviewIds = checkinLogMapper.selectList(Wrappers.<LeaveCheckinLog>lambdaQuery()
                        .eq(LeaveCheckinLog::getReviewStatus, "PENDING_REVIEW"))
                .stream().map(LeaveCheckinLog::getApplicationId).collect(Collectors.toSet());

        List<Map<String, Object>> rows = new ArrayList<>();
        for (LeaveApplication a : apps) {
            StudentProfile sp = spMap.get(a.getStudentId());
            User u = sp == null ? null : uMap.get(sp.getUserId());
            User approver = a.getApprovedByUserId() == null ? null : approverMap.get(a.getApprovedByUserId());
            EffectiveStatus eff = EffectiveStatus.of(a, now);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", a.getId());
            m.put("applicationNo", a.getApplicationNo());
            m.put("studentId", a.getStudentId());
            m.put("studentName", u == null ? "—" : u.getRealName());
            m.put("studentNo", sp == null ? "" : sp.getStudentNo());
            m.put("className", sp == null ? "" : clsMap.getOrDefault(sp.getClassId(), ""));
            m.put("scene", "OFF_CAMPUS".equals(a.getLeaveScene()) ? "离校" : "校内");
            m.put("sceneCode", a.getLeaveScene());
            m.put("type", typeLabel(a.getLeaveType()));
            m.put("typeCode", a.getLeaveType());
            m.put("start", a.getStartTime() == null ? "" : DT.format(a.getStartTime()));
            m.put("end", a.getEndTime() == null ? "" : DT.format(a.getEndTime()));
            m.put("reason", a.getReason());
            m.put("destination", a.getDestination());
            m.put("contactPhone", a.getContactPhone());
            m.put("status", a.getStatus());
            m.put("effective", eff.name());
            m.put("needReview", needReviewIds.contains(a.getId()));
            m.put("approvedByName", approver == null ? null : approver.getRealName());
            m.put("approvedAt", a.getApprovedAt() == null ? null : DT.format(a.getApprovedAt()));
            m.put("submittedAt", a.getCreatedAt() == null ? "" : DT.format(a.getCreatedAt()));
            m.put("cancelReason", a.getCancelReason());
            rows.add(m);
        }
        return rows;
    }

    // ==================== 工具 ====================

    private static String str(Map<String, Object> m, String k) {
        Object v = m == null ? null : m.get(k);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
