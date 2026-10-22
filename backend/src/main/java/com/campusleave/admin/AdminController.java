package com.campusleave.admin;

import com.campusleave.common.PageResult;
import com.campusleave.common.Result;
import com.campusleave.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理端接口（03_API §7，14 个端点）。
 *
 * <p>整个类的门禁只有一条：{@code requireRole("ADMIN")}。
 * 教师账号即使知道 URL 也进不来 —— 管理端能改密码、能停用账号，
 * 权限必须比教师端更硬。
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService service;

    // ---------------- 7.1 账号 ----------------

    @GetMapping("/users")
    public Result<PageResult<Map<String, Object>>> users(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.users(role, keyword, page, size));
    }

    @PostMapping("/users")
    public Result<Map<String, Object>> createUser(@RequestBody Map<String, Object> body) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.createUser(body));
    }

    @PutMapping("/users/{id}/status")
    public Result<Void> setStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        CurrentUser.requireRole("ADMIN");
        service.setUserStatus(id, body == null ? null : body.get("status"));
        return Result.ok();
    }

    @PutMapping("/users/{id}/password")
    public Result<Void> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        CurrentUser.requireRole("ADMIN");
        service.resetPassword(id, body == null ? null : body.get("newPassword"));
        return Result.ok();
    }

    // ---------------- 7.2 班级 ----------------

    @GetMapping("/classes")
    public Result<PageResult<Map<String, Object>>> classes(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.classes(keyword, page, size));
    }

    @PostMapping("/classes")
    public Result<Map<String, Object>> createClass(@RequestBody Map<String, Object> body) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.createClass(body));
    }

    @PutMapping("/classes/{id}")
    public Result<Void> updateClass(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        CurrentUser.requireRole("ADMIN");
        service.updateClass(id, body);
        return Result.ok();
    }

    @DeleteMapping("/classes/{id}")
    public Result<Void> disableClass(@PathVariable Long id) {
        CurrentUser.requireRole("ADMIN");
        service.disableClass(id);
        return Result.ok();
    }

    // ---------------- 7.3 辅导员-班级绑定 ----------------

    @GetMapping("/teacher-classes")
    public Result<List<Map<String, Object>>> teacherClasses(
            @RequestParam(required = false) Long teacherId,
            @RequestParam(required = false) Long classId) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.teacherClasses(teacherId, classId));
    }

    @PostMapping("/teacher-classes")
    public Result<Map<String, Object>> bind(@RequestBody Map<String, Object> body) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.bind(body));
    }

    @DeleteMapping("/teacher-classes/{id}")
    public Result<Void> unbind(@PathVariable Long id) {
        CurrentUser.requireRole("ADMIN");
        service.unbind(id);
        return Result.ok();
    }

    // ---------------- 7.4 系统配置 ----------------

    @GetMapping("/configs")
    public Result<List<Map<String, Object>>> configs() {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.configs());
    }

    @PutMapping("/configs/{key}")
    public Result<Void> updateConfig(@PathVariable String key, @RequestBody Map<String, String> body) {
        CurrentUser.requireRole("ADMIN");
        service.updateConfig(key, body == null ? null : body.get("configValue"));
        return Result.ok();
    }

    // ---------------- 7.6 管理端概览 ----------------

    @GetMapping("/overview")
    public Result<Map<String, Object>> overview() {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.overview());
    }

    // ---------------- 7.7 全校申请列表 ----------------

    @GetMapping("/applications")
    public Result<PageResult<Map<String, Object>>> applications(
            @RequestParam(required = false) String scope,
            @RequestParam(required = false) String review,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.applications(scope, review, keyword, page, size));
    }

    // ---------------- 7.5 全校统计 ----------------

    @GetMapping("/stats")
    public Result<Map<String, Object>> stats(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        CurrentUser.requireRole("ADMIN");
        return Result.ok(service.stats(startDate, endDate));
    }
}
