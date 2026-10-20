package com.campusleave.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户账号表实体，对应数据库表 `user`（02 数据库设计 §4）。
 *
 * <p>几个要点（答辩可能被问）：
 * <ul>
 *   <li>@TableName("`user`")：user 是 MySQL 保留字，表名要加反引号，否则 SQL 报错</li>
 *   <li>@TableId(type = IdType.AUTO)：主键自增</li>
 *   <li>passwordHash：只存 BCrypt 哈希，绝不存明文、绝不返回给前端</li>
 *   <li>status：ACTIVE / DISABLED，账号禁用用这个字段，不做物理删除（02 §26）</li>
 * </ul>
 *
 * <p>MyBatis-Plus 的约定：字段名驼峰（realName）自动映射下划线列名（real_name），
 * 无需写 XML，普通 CRUD 直接用 BaseMapper。
 */
@Data
@TableName("`user`")
public class User {
    @TableId(type = IdType.AUTO)
    private Long id;                    // 用户主键
    private String username;            // 登录账号（学号/工号/管理员账号，全局唯一）
    private String passwordHash;        // 密码哈希（BCrypt）
    private String role;                // STUDENT / TEACHER / ADMIN
    private String realName;            // 姓名
    private String phone;               // 联系电话
    private String avatar;              // 头像地址（相对 URL）
    private String status;              // ACTIVE / DISABLED
    private LocalDateTime lastLoginAt;  // 最近登录时间
    private LocalDateTime createdAt;    // 创建时间
    private LocalDateTime updatedAt;    // 更新时间
}
