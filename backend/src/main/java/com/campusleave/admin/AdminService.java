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
        Map<Long, String> teacherName = teacherMapper.selectList(null).stream()
                .collect(Collectors.toMap(TeacherProfile::getId, TeacherProfile::getTeacherNo, (a, b) -> a));

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
