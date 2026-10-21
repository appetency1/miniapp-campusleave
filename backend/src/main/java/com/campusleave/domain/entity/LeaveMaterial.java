package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 请假材料表实体（02 §8）。DB 只存相对 URL（如 /files/2026/10/xxx.jpg），
 * 前端展示时拼 BASE_URL —— 这样换域名/迁服务器不用改数据。
 */
@Data
@TableName("leave_material")
public class LeaveMaterial {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long applicationId;
    private String materialType;   // MEDICAL_PROOF / LEAVE_FORM / OTHER
    private String fileName;
    private String fileUrl;        // 相对路径
    private Long fileSize;
    private String mimeType;
    private Long uploadedBy;
    private LocalDateTime createdAt;
}
