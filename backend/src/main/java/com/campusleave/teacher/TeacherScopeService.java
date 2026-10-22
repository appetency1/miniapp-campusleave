package com.campusleave.teacher;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campusleave.common.BizException;
import com.campusleave.common.ErrorCode;
import com.campusleave.domain.entity.ClassInfo;
import com.campusleave.domain.entity.StudentProfile;
import com.campusleave.domain.entity.TeacherClass;
import com.campusleave.domain.entity.TeacherProfile;
import com.campusleave.domain.mapper.ClassInfoMapper;
import com.campusleave.domain.mapper.StudentProfileMapper;
import com.campusleave.domain.mapper.TeacherClassMapper;
import com.campusleave.domain.mapper.TeacherProfileMapper;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 教师端数据范围（03_API §6 全章的数据前提）。
 *
 * <p><b>这是教师端唯一的数据边界</b>，答辩必问："教师能不能看到别的班？"
 * 答案：不能。所有 teacher 接口都先经过这里拿 classIds / studentIds，
 * 再把这些 id 拼进 SQL 的 IN 条件；任何前端传来的 classId 参数都必须先和这里取交集。
 *
 * <p>链路：{@code user.id → teacher_profile.user_id → teacher_profile.id
 * → teacher_class.teacher_id → class_id → student_profile.class_id → student_id}。
 *
 * <p><b>空集合的处理</b>：未绑定班级的教师，classIds 为空。此时绝不能拼
 * {@code IN ()}（SQL 语法错误），所以所有查询方法在空集合时直接返回空结果。
 */
@Service
@RequiredArgsConstructor
public class TeacherScopeService {

    private final TeacherProfileMapper teacherProfileMapper;
    private final TeacherClassMapper teacherClassMapper;
    private final StudentProfileMapper studentMapper;
    private final ClassInfoMapper classMapper;

    /** 当前登录教师档案（不存在说明账号建了但没建 teacher_profile） */
    public TeacherProfile currentTeacher() {
        Long userId = CurrentUser.requireUserId();
        TeacherProfile tp = teacherProfileMapper.selectOne(
                Wrappers.<TeacherProfile>lambdaQuery().eq(TeacherProfile::getUserId, userId));
        if (tp == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "教师档案不存在，请联系管理员");
        }
        return tp;
    }

    /** 当前教师负责的班级 id（可能为空） */
    public List<Long> classIds() {
        Long teacherId = currentTeacher().getId();
        return teacherClassMapper
                .selectList(Wrappers.<TeacherClass>lambdaQuery().eq(TeacherClass::getTeacherId, teacherId))
                .stream()
                .map(TeacherClass::getClassId)
                .distinct()
                .collect(Collectors.toList());
    }

    /** 当前教师负责班级下的学生 id（可能为空） */
    public List<Long> studentIds() {
        List<Long> classes = classIds();
        if (classes.isEmpty()) {
            return Collections.emptyList();
        }
        return studentMapper
                .selectList(Wrappers.<StudentProfile>lambdaQuery().in(StudentProfile::getClassId, classes))
                .stream()
                .map(StudentProfile::getId)
                .collect(Collectors.toList());
    }

    /** 当前教师负责的班级 id → 班级名，用于列表展示 */
    public Map<Long, String> classNames() {
        List<Long> classes = classIds();
        if (classes.isEmpty()) {
            return Collections.emptyMap();
        }
        return classMapper.selectBatchIds(classes).stream()
                .collect(Collectors.toMap(ClassInfo::getId, ClassInfo::getClassName, (a, b) -> a));
    }

    /** 校验某个学生是否在负责范围内，越权直接 403 */
    public void assertStudentInScope(Long studentId) {
        if (studentId == null || !studentIds().contains(studentId)) {
            throw new BizException(ErrorCode.FORBIDDEN, "该学生不在你负责的班级内");
        }
    }

    /**
     * 前台传入的 classId 筛选参数 → 实际可用的 classId。
     * 传了但不在范围内，直接 403；没传则返回全部负责班级。
     */
    public List<Long> resolveClassFilter(Long requestedClassId) {
        List<Long> mine = classIds();
        if (requestedClassId == null) {
            return mine;
        }
        if (!mine.contains(requestedClassId)) {
            throw new BizException(ErrorCode.FORBIDDEN, "该班级不在你的负责范围内");
        }
        return List.of(requestedClassId);
    }

    /** 学生 id → 学生档案（批量，避免列表里 N+1） */
    public Map<Long, StudentProfile> studentMap(List<Long> studentIds) {
        if (studentIds == null || studentIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return studentMapper.selectBatchIds(studentIds).stream()
                .collect(Collectors.toMap(StudentProfile::getId, Function.identity(), (a, b) -> a));
    }
}
