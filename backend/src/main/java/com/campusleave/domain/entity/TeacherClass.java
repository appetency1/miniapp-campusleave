package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 辅导员-班级关系表实体（02 §5）。
 *
 * <p>一个班级有且仅有一个辅导员（class_id 唯一键保证），
 * 这是教师端「数据范围 = 负责班级」的基础。
 */
@Data
@TableName("teacher_class")
public class TeacherClass {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long teacherId;   // teacher_profile.id
    private Long classId;     // class_info.id
    private LocalDateTime createdAt;
}
