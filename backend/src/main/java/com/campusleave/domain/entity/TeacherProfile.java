package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 教师信息表实体（02 §4）。
 */
@Data
@TableName("teacher_profile")
public class TeacherProfile {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String teacherNo;   // 工号
    private String department;
    private String title;       // 职称
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
