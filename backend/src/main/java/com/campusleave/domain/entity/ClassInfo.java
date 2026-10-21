package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 班级表实体（02 §3）。
 */
@Data
@TableName("class_info")
public class ClassInfo {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String className;   // 班级名，如「计算机2301班」
    private String classCode;   // 班级编码，唯一
    private String major;       // 专业
    private String grade;       // 年级
    private String status;      // ACTIVE / DISABLED（软删，不物理删除）
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
