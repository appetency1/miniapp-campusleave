package com.campusleave.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 修改密码请求体（03_API §3.3）。
 *
 * <p>学生/教师自己改密码用；管理员重置他人密码走 `PUT /admin/users/{id}/password`（不需要原密码）。
 */
@Data
public class ChangePasswordRequest {

    @NotBlank(message = "原密码不能为空")
    private String oldPassword;

    /**
     * 新密码：至少 6 位。
     *
     * <p>为什么不是 8：演示基线的所有账号都是 `123456`（含 RT 文档、seed、登录页填充）。
     * 定成 8 会导致「管理员想重置回 123456 被拒」，演示走不通。
     * 生产环境应收紧到 8 位以上并配合登录限流（见 AGENTS §11 P1）。
     */
    @NotBlank(message = "新密码不能为空")
    @Size(min = 6, max = 64, message = "新密码至少 6 位")
    private String newPassword;
}
