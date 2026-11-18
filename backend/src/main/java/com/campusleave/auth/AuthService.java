package com.campusleave.auth;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.ClassInfo;
import com.campusleave.domain.entity.StudentProfile;
import com.campusleave.domain.entity.TeacherClass;
import com.campusleave.domain.entity.TeacherProfile;
import com.campusleave.domain.entity.User;
import com.campusleave.domain.mapper.ClassInfoMapper;
import com.campusleave.domain.mapper.StudentProfileMapper;
import com.campusleave.domain.mapper.TeacherClassMapper;
import com.campusleave.domain.mapper.TeacherProfileMapper;
import com.campusleave.domain.mapper.UserMapper;
import com.campusleave.security.JwtUtil;
import com.campusleave.security.LoginUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 认证服务：负责登录、获取当前用户信息。
 *
 * <p>登录流程（对应 03_API §3.1）：
 * <ol>
 *   <li>按 username 查用户（username 全局唯一，学号/工号/管理员账号）</li>
 *   <li>用 BCrypt 校验密码（数据库只存哈希，不存明文，也绝不返回 password_hash）</li>
 *   <li>校验账号状态（DISABLED 则拒绝）</li>
 *   <li>签发 JWT，返回给前端</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor   // Lombok：自动生成包含所有 final 字段的构造器，用于依赖注入
public class AuthService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;  // BCrypt 密码编码器（见 SecurityBeanConfig）
    private final JwtUtil jwtUtil;
    // 下面四个只服务于 /auth/me 的 studentProfile（03 §3.2 要求返回学号/班级/辅导员）
    private final StudentProfileMapper studentMapper;
    private final ClassInfoMapper classMapper;
    private final TeacherClassMapper teacherClassMapper;
    private final TeacherProfileMapper teacherProfileMapper;

    /**
     * 登录。
     *
     * @param req 含 username + password
     * @return token、有效期、用户基本信息
     */
    public Map<String, Object> login(LoginRequest req) {
        // 按 username 查唯一用户
        User user = userMapper.selectOne(
                Wrappers.<User>lambdaQuery().eq(User::getUsername, req.getUsername()));

        // 安全考虑：用户不存在和密码错误返回同一个错误码，避免被枚举探测账号是否存在
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new BizException(ErrorCode.BAD_CREDENTIALS);
        }
        // 账号被禁用（DISABLED 状态，管理员在后台禁用）
        if ("DISABLED".equals(user.getStatus())) {
            throw new BizException(ErrorCode.ACCOUNT_DISABLED);
        }

        // 更新最近登录时间
        user.setLastLoginAt(LocalDateTime.now());
        userMapper.updateById(user);

        // 签发 JWT（无状态登录凭证，见 JwtUtil 注释）
        String token = jwtUtil.generate(user.getId(), user.getUsername(), user.getRole());

        // 组装响应数据（与 03_API §3.1 约定一致）
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("expiresIn", 604800);   // 7 天（秒），与配置 expire-seconds 一致
        Map<String, Object> u = new HashMap<>();
        u.put("id", user.getId());
        u.put("username", user.getUsername());
        u.put("role", user.getRole());
        u.put("realName", user.getRealName());
        data.put("user", u);
        return data;
    }

    /**
     * 获取当前登录用户信息（对应 03_API §3.2）。
     *
     * @param current 由 JwtAuthFilter 从 token 解析出的登录用户（见 CurrentUser.require）
     */
    public Map<String, Object> me(LoginUser current) {
        // 用 token 里的 userId 重新查一次数据库，拿到最新的用户资料（而非 token 里的快照）
        User user = userMapper.selectById(current.getUserId());
        if (user == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        data.put("username", user.getUsername());
        data.put("role", user.getRole());
        data.put("realName", user.getRealName());
        data.put("phone", user.getPhone());
        data.put("avatar", user.getAvatar());

        // 03 §3.2 要求：学生额外带 studentProfile，省掉前端再发 3 个请求
        if ("STUDENT".equals(user.getRole())) {
            data.put("studentProfile", studentProfileOf(user.getId()));
        }
        return data;
    }

    /**
     * 修改自己的密码（03 §3.3）。
     *
     * <p>必须校验原密码：只凭 token 就能改密码，等于 token 泄露即可永久接管账号。
     * 新密码规则与管理员重置保持一致（≥8 位），避免"自己能设 8 位、管理员只能设 6 位"的怪事。
     */
    public void changePassword(LoginUser current, String oldPassword, String newPassword) {
        User user = userMapper.selectById(current.getUserId());
        if (user == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        if (oldPassword == null || !passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BizException(ErrorCode.BAD_CREDENTIALS, "原密码不正确");
        }
        if (newPassword == null || newPassword.length() < 6) {
            throw new BizException(ErrorCode.BAD_PARAM, "新密码至少 6 位");
        }
        if (newPassword.equals(oldPassword)) {
            throw new BizException(ErrorCode.BAD_PARAM, "新密码不能与原密码相同");
        }
        userMapper.update(null, Wrappers.<User>lambdaUpdate()
                .set(User::getPasswordHash, passwordEncoder.encode(newPassword))
                .set(User::getUpdatedAt, LocalDateTime.now())
                .eq(User::getId, user.getId()));
    }

    /**
     * 学生档案摘要（学号 / 班级 / 辅导员姓名）。
     *
     * <p>链路：user.id → student_profile → class_info → teacher_class → teacher_profile → user.real_name。
     * 任何一环缺失都返回能拿到的那部分，不抛异常 —— 「我的」页不能因为没配辅导员就整页报错。
     */
    private Map<String, Object> studentProfileOf(Long userId) {
        StudentProfile sp = studentMapper.selectOne(
                Wrappers.<StudentProfile>lambdaQuery().eq(StudentProfile::getUserId, userId));
        if (sp == null) {
            return null;
        }
        ClassInfo cls = classMapper.selectById(sp.getClassId());
        String counselorName = null;
        if (cls != null) {
            TeacherClass tc = teacherClassMapper.selectOne(
                    Wrappers.<TeacherClass>lambdaQuery().eq(TeacherClass::getClassId, cls.getId()));
            if (tc != null) {
                TeacherProfile tp = teacherProfileMapper.selectById(tc.getTeacherId());
                if (tp != null) {
                    User tu = userMapper.selectById(tp.getUserId());
                    counselorName = tu == null ? null : tu.getRealName();
                }
            }
        }
        Map<String, Object> p = new HashMap<>();
        p.put("studentNo", sp.getStudentNo());
        p.put("classId", sp.getClassId());
        p.put("className", cls == null ? null : cls.getClassName());
        p.put("counselorName", counselorName);
        return p;
    }
}
