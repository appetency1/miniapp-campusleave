package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学生信息表实体（02 §5）。
 *
 * <p>与 {@link User} 是 1:1 关系：user 存账号与登录信息，student_profile 存学籍信息。
 * 拆开的原因：教师、管理员没有学籍，不需要这些字段，避免 user 表塞满可空列。
 */
@Data
@TableName("student_profile")
public class StudentProfile {
    @TableId(type = IdType.AUTO)
    private Long id;                  // 学生ID（业务主键，请假申请引用这个）
    private Long userId;              // 对应 user.id
    private String studentNo;         // 学号
    private Long classId;             // 所属班级
    private String gender;            // 性别
    private String major;             // 专业
    private String grade;             // 年级
    private Integer enrollmentYear;   // 入学年份
    private String emergencyContact;  // 紧急联系人
    private String emergencyPhone;    // 紧急联系电话
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
